import { EditorView } from '@codemirror/view';
import { editorInfoField, FileView, MarkdownView, Notice, Platform, Plugin, TFile, TFolder } from 'obsidian';
import { countWords, Mode } from './stats';
import { STATS_VIEW, TimerStatsView, StatsRow } from './view';
import { FileTimer, formatTime } from './timer';
import { DATA_FOLDER, RECORDS_FOLDER, isTimerData, Ledger, migrateLegacy, validateDocument } from './ledger';
import { SyncStore } from './sync';
import { shouldTrack, writtenWords } from './activity';

const CHECKPOINT_KEY = 'statusbar-file-timer:checkpoint-v1';
export default class StatusBarFileTimer extends Plugin {
  private timer = new FileTimer();
  private ledger = new Ledger(crypto.randomUUID());
  private store!: SyncStore;
  private runningPath: string | null = null;
  private status?: HTMLElement;
  private lastFilePath: string | null = null;
  private stopped = false;
  private ready = false;
  private windows = new Set<Window>();
  private hiddenPages = new WeakSet<Document>();
  private saves: Promise<void> = Promise.resolve();
  private saveFailed = false;
  private readFailures = new Set<string>();
  private wordCache = new Map<string, number>();
  private latestStatus = 'Loading timer data…';

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.store = new SyncStore(this.ledger, {
      list: () => this.app.vault.getFiles().filter(file => this.isRecord(file.path)).map(file => file.path),
      read: async path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file === null) return null;
        if (!(file instanceof TFile)) throw new Error(`Expected a file at ${path}`);
        return this.app.vault.read(file);
      },
      write: async (path, text) => {
        await this.ensureFolder(DATA_FOLDER);
        await this.ensureFolder(RECORDS_FOLDER);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.vault.modify(file, text);
        else if (file === null) await this.app.vault.create(path, text);
        else throw new Error(`Expected a file at ${path}`);
      },
    }, (path, error) => {
      console.warn('File timer: could not read sync data', path, error);
      if (!this.readFailures.has(path)) new Notice(`File timer could not read ${path}. The file was left unchanged; totals may be incomplete.`);
      this.readFailures.add(path);
    });
    this.registerView(STATS_VIEW, leaf => new TimerStatsView(leaf, this));
    this.addRibbonIcon('chart-no-axes-column', 'Open file time & words', () => { void this.showTotals(); });
    if (!Platform.isMobile) {
      this.status = this.addStatusBarItem();
      this.status.addClass('statusbar-file-timer');
      this.status.setAttribute('role', 'button');
      this.status.tabIndex = 0;
      this.registerDomEvent(this.status, 'click', () => this.togglePause());
      this.registerDomEvent(this.status, 'keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.togglePause(); }
      });
    }
    this.addCommand({ id: 'toggle-pause', name: 'Pause or resume tracking for this file', callback: () => this.togglePause() });
    this.addCommand({ id: 'show-totals', name: 'Show file time totals', callback: () => this.showTotals() });
    this.addCommand({ id: 'sync-now', name: 'Save and refresh shared timer data', callback: () => {
      void this.syncNow().catch(error => this.reportSaveError(error));
    } });
    this.registerEditorExtension(EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      const path = update.state.field(editorInfoField, false)?.file?.path;
      const userEdit = update.transactions.some(transaction => ['input', 'delete', 'undo', 'redo'].some(type => transaction.isUserEvent(type)));
      this.tick();
      if (!path || this.runningPath !== path || this.mode(path) !== 'writing') return;
      const added = writtenWords(update.startState.doc.toString(), update.state.doc.toString(), userEdit);
      if (added) this.ledger.record(path, 0, added, 'writing', Date.now());
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.transition()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.transition()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.transition()));
    const receive = (file: TFile) => {
      if (this.isRecord(file.path)) void this.store.receive(file.path).then(async () => {
        for (const row of this.ledger.rows()) {
          if (this.stopped) return;
          if (this.wordCache.has(row.path)) continue;
          const note = this.app.vault.getAbstractFileByPath(row.path);
          if (note instanceof TFile) await this.refreshWords(note);
        }
        this.tick(); this.refreshViews();
      });
      else if (!isTimerData(file.path) && this.ledger.rows().some(row => row.path === file.path)) void this.refreshWords(file);
    };
    this.registerEvent(this.app.vault.on('create', file => { if (file instanceof TFile) receive(file); }));
    this.registerEvent(this.app.vault.on('modify', file => { if (file instanceof TFile) receive(file); }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (isTimerData(oldPath) || isTimerData(file.path)) {
        if (this.isRecord(oldPath)) this.store.remove(oldPath);
        if (file instanceof TFile && this.isRecord(file.path)) void this.store.receive(file.path);
        return;
      }
      if (!this.ready) return;
      this.ledger.move(oldPath, file.path, Date.now());
      if (this.lastFilePath === oldPath || this.lastFilePath?.startsWith(oldPath + '/')) this.lastFilePath = file.path + this.lastFilePath.slice(oldPath.length);
      this.timer.rename(oldPath, file.path);
      for (const [path, words] of this.wordCache) {
        if (path === oldPath || path.startsWith(oldPath + '/')) {
          this.wordCache.delete(path); this.wordCache.set(file.path + path.slice(oldPath.length), words);
        }
      }
      this.runningPath = null; this.transition(); this.refreshViews();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (isTimerData(file.path)) {
        if (this.isRecord(file.path)) this.store.remove(file.path);
        this.refreshViews(); return;
      }
      if (!this.ready) return;
      this.ledger.move(file.path, null, Date.now());
      if (this.lastFilePath === file.path || this.lastFilePath?.startsWith(file.path + '/')) this.lastFilePath = null;
      this.timer.remove(file.path); this.runningPath = null;
      for (const path of this.wordCache.keys()) if (path === file.path || path.startsWith(file.path + '/')) this.wordCache.delete(path);
      this.transition(); this.refreshViews();
    }));
    this.bindWindow(window);
    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    this.registerInterval(window.setInterval(() => this.checkpoint(), 5000));
    this.registerInterval(window.setInterval(() => { void this.persist(); }, 30000));
    this.app.workspace.onLayoutReady(() => {
      void this.initialize(saved).catch(error => {
        this.latestStatus = 'Timer data could not be loaded. Reload the plugin to retry.';
        this.reportSaveError(error); this.refreshViews();
      });
    });
  }

  private async initialize(saved: unknown): Promise<void> {
    await this.store.load();
    const pending = this.app.loadLocalStorage(CHECKPOINT_KEY);
    if (pending) await this.store.write(validateDocument(pending));
    if ((saved as { version?: number } | null)?.version !== 4) {
      const legacy = migrateLegacy(saved, 'legacy-' + crypto.randomUUID());
      await this.store.write(legacy);
      await this.saveData({ version: 4, storage: 'File Timer/sessions' });
    }
    if (this.stopped) return;
    this.app.saveLocalStorage(CHECKPOINT_KEY, null);
    this.ready = true;
    this.transition();
    for (const row of this.ledger.rows()) {
      if (this.stopped) break;
      const file = this.app.vault.getAbstractFileByPath(row.path);
      if (file instanceof TFile) await this.refreshWords(file);
    }
    this.refreshViews();
  }
  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`A file blocks the timer folder: ${path}`);
    try { await this.app.vault.createFolder(path); }
    catch (error) { if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)) throw error; }
  }
  private isRecord(path: string): boolean { return path.startsWith(RECORDS_FOLDER + '/') && path.endsWith('.md'); }
  private bindWindow(win: Window): void {
    if (this.windows.has(win)) return;
    this.windows.add(win);
    this.registerDomEvent(win, 'focus', () => this.transition());
    // Mobile focus can change when the software keyboard opens. Visibility is the foreground signal there.
    this.registerDomEvent(win, 'blur', () => { if (!Platform.isMobile) this.transition(true); });
    this.registerDomEvent(win.document, 'visibilitychange', () => {
      this.transition(win.document.visibilityState !== 'visible');
    });
    this.registerDomEvent(win, 'pagehide', () => { this.hiddenPages.add(win.document); this.transition(true); });
    this.registerDomEvent(win, 'pageshow', () => { this.hiddenPages.delete(win.document); this.transition(); });
  }
  private activeView(): FileView | null {
    const view = this.app.workspace.getActiveViewOfType(FileView);
    return view?.file && !isTimerData(view.file.path) ? view : null;
  }
  private mode(path: string): Mode {
    return this.ledger.rows().find(row => row.path === path)?.stats.mode ?? (/^clippings\//i.test(path) || /\/clippings\//i.test(path) ? 'reading' : 'writing');
  }
  private tick(forcePause = false): void {
    if (this.stopped || !this.ready) return;
    const view = this.activeView();
    const doc = view?.containerEl.ownerDocument;
    if (doc?.defaultView) this.bindWindow(doc.defaultView);
    const path = view?.file?.path ?? null;
    if (path) this.lastFilePath = path;
    const paused = path ? this.ledger.isPaused(path) : false;
    const running = shouldTrack({ mobile: Platform.isMobile, focused: doc?.hasFocus() ?? false,
      visible: doc?.visibilityState === 'visible', suspended: forcePause || (doc ? this.hiddenPages.has(doc) : false),
      paused, hasFile: !!view, inView: !!view?.containerEl.getClientRects().length });
    const now = Date.now();
    const credit = this.timer.update(now, running ? path : null);
    if (credit) this.ledger.record(credit.path, credit.ms, 0, this.mode(credit.path), now);
    const words = view instanceof MarkdownView ? countWords(view.editor.getValue()) : null;
    if (path && words !== null) {
      this.wordCache.set(path, words);
      if (running) this.ledger.words(path, words, now);
    }
    this.runningPath = running ? path : null;
    const total = this.ledger.rows().find(row => row.path === path)?.total ?? 0;
    this.latestStatus = `${running ? 'Tracking' : 'Paused'} · ${formatTime(total)}${view?.file ? ' · ' + view.file.basename : ''}`;
    this.status?.setText(`${running ? '▶' : 'Ⅱ'} ${formatTime(total)}`);
    const label = `${view?.file?.path ?? 'No active file'} · ${this.latestStatus}. Click to ${paused ? 'resume' : 'pause'} tracking for this file.`;
    this.status?.setAttribute('aria-label', label);
    this.status?.setAttribute('title', label);
    this.status?.toggleClass('is-paused', !running);
  }
  private transition(forcePause = false): void { this.tick(forcePause); void this.persist(); }
  togglePause(path?: string): void {
    if (!this.ready) return;
    const target = path ?? this.activeView()?.file?.path ?? this.lastFilePath;
    if (!target || isTimerData(target) || !(this.app.vault.getAbstractFileByPath(target) instanceof TFile)) return;
    this.tick();
    this.ledger.pause(target, !this.ledger.isPaused(target), Date.now());
    this.transition(); this.refreshViews();
  }
  trackingState(): { paused: boolean; text: string; path: string | null } {
    const path = this.activeView()?.file?.path ?? this.lastFilePath;
    const paused = path ? this.ledger.isPaused(path) : false;
    const text = !this.ready ? this.latestStatus : path ? `${paused ? 'Tracking paused' : 'Tracking enabled'} · ${path}` : 'Open a file to control its timer.';
    return { paused, text, path };
  }
  private checkpoint(): void {
    if (!this.ready) return;
    try { this.app.saveLocalStorage(CHECKPOINT_KEY, this.ledger.local); }
    catch (error) { this.reportSaveError(error); }
  }
  private reportSaveError(error: unknown): void {
    console.error('File timer: could not save/load data', error);
    if (!this.saveFailed) new Notice('File timer could not save/load its data. Check vault storage and reload the plugin if tracking has not started.');
    this.saveFailed = true;
  }
  private persist(): Promise<void> {
    if (!this.ready) return Promise.resolve();
    this.checkpoint();
    const document = structuredClone(this.ledger.local);
    this.saves = this.saves.then(() => this.store.write(document)).then(() => { this.saveFailed = false; }).catch(error => this.reportSaveError(error));
    return this.saves;
  }
  private async syncNow(): Promise<void> {
    if (!this.ready) return;
    this.tick(); await this.persist(); await this.store.load(); this.refreshViews();
  }
  rows(): StatsRow[] {
    return this.ledger.rows().filter(row => (row.total > 0 || row.paused) && this.app.vault.getAbstractFileByPath(row.path) instanceof TFile)
      .map(row => ({ ...row, stats: { ...row.stats, words: this.wordCache.get(row.path) ?? row.stats.words } }));
  }
  setMode(path: string, mode: Mode): void {
    if (!this.ready) return;
    this.tick(); this.ledger.mode(path, mode, Date.now()); this.runningPath = null; void this.persist();
  }
  private async refreshWords(file: TFile): Promise<void> {
    if (file.extension !== 'md' || isTimerData(file.path)) return;
    const path = file.path;
    try {
      const text = await this.app.vault.cachedRead(file);
      if (this.stopped || file.path !== path || this.app.vault.getAbstractFileByPath(path) !== file) return;
      const view = this.activeView();
      this.wordCache.set(path, countWords(view instanceof MarkdownView && view.file === file ? view.editor.getValue() : text));
    } catch (error) { console.warn('File timer could not count words', error); }
  }
  private refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(STATS_VIEW)) if (leaf.view instanceof TimerStatsView) leaf.view.refresh();
  }
  private async showTotals(): Promise<void> {
    this.tick();
    let leaf = this.app.workspace.getLeavesOfType(STATS_VIEW)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: STATS_VIEW, active: true }); }
    await this.app.workspace.revealLeaf(leaf);
  }
  onunload(): void { this.tick(true); this.stopped = true; void this.persist(); }
}
