import { FileView, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { countWords, FileStatistics, Mode } from './stats';
import { STATS_VIEW, TimerStatsView, StatsRow } from './view';
import { FileTimer, formatTime } from './timer';

export default class StatusBarFileTimer extends Plugin {
  private timer = new FileTimer();
  private statistics = new FileStatistics();
  private runningPath: string | null = null;
  private sampleAt = 0;
  private status!: HTMLElement;
  private paused = false;
  private stopped = false;
  private windows = new Set<Window>();
  private saves: Promise<void> = Promise.resolve();
  private saveFailed = false;

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.timer = new FileTimer(saved?.totals);
    this.statistics = new FileStatistics(saved?.statistics);
    this.registerView(STATS_VIEW, leaf => new TimerStatsView(leaf, this));
    this.addRibbonIcon('chart-no-axes-column', 'Open file time & words', () => { void this.showTotals(); });
    this.registerEvent(this.app.workspace.on('editor-change', () => this.tick()));
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file instanceof TFile && Object.hasOwn(this.timer.totals, file.path)) void this.refreshWords(file);
    }));
    for (const path of Object.keys(this.timer.totals)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) void this.refreshWords(file);
    }
    this.status = this.addStatusBarItem();
    this.status.addClass('statusbar-file-timer');
    this.status.setAttribute('role', 'button');
    this.status.tabIndex = 0;
    this.registerDomEvent(this.status, 'click', () => this.togglePause());
    this.registerDomEvent(this.status, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.togglePause(); }
    });
    this.addCommand({ id: 'toggle-pause', name: 'Pause or resume tracking', callback: () => this.togglePause() });
    this.addCommand({ id: 'show-totals', name: 'Show file time totals', callback: () => this.showTotals() });
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.transition()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.transition()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.transition()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.timer.rename(oldPath, file.path); this.statistics.rename(oldPath, file.path); this.transition();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      this.timer.remove(file.path); this.statistics.remove(file.path); this.transition();
    }));
    this.bindWindow(window);
    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    this.registerInterval(window.setInterval(() => { void this.persist(); }, 5000));
    this.app.workspace.onLayoutReady(() => { if (!this.stopped) this.transition(); });
  }

  private bindWindow(win: Window): void {
    if (this.windows.has(win)) return;
    this.windows.add(win);
    this.registerDomEvent(win, 'focus', () => this.transition());
    this.registerDomEvent(win, 'blur', () => this.transition(true));
    this.registerDomEvent(win.document, 'visibilitychange', () => this.transition());
    this.registerDomEvent(win, 'pagehide', () => this.transition(true));
  }

  private activeView(): FileView | null {
    const view = this.app.workspace.getActiveViewOfType(FileView);
    return view?.file ? view : null;
  }

  private tick(forcePause = false): void {
    if (this.stopped) return;
    const view = this.activeView();
    const doc = view?.containerEl.ownerDocument;
    if (doc?.defaultView) this.bindWindow(doc.defaultView);
    const running = !forcePause && !this.paused && view && doc?.hasFocus()
      && doc.visibilityState === 'visible' && view.containerEl.getClientRects().length > 0;
    const now = Date.now();
    const path = view?.file?.path ?? null;
    const credit = this.timer.update(now, running ? path : null);
    if (credit) this.statistics.credit(credit.path, credit.ms, now);
    const words = view instanceof MarkdownView ? countWords(view.editor.getValue()) : null;
    if (path && words !== null) this.statistics.get(path).words = words;
    const continuous = this.runningPath === path && now - this.sampleAt >= 0 && now - this.sampleAt <= 2500;
    this.statistics.sample(path, words, continuous);
    if (!running) this.statistics.sample(null, null, false);
    this.runningPath = running ? path : null;
    this.sampleAt = now;
    const total = view ? this.timer.totals[view.file!.path] ?? 0 : 0;
    this.status.setText(`${running ? '▶' : 'Ⅱ'} ${formatTime(total)}`);
    const label = `${view?.file?.path ?? 'No active file'} · ${running ? 'Tracking' : 'Paused'} · ${formatTime(total)}. Click to ${this.paused ? 'resume' : 'pause'} tracking.`;
    this.status.setAttribute('aria-label', label);
    this.status.setAttribute('title', label);
    this.status.toggleClass('is-paused', !running);
  }

  private transition(forcePause = false): void {
    this.tick(forcePause);
    void this.persist();
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.transition();
  }

  private persist(): Promise<void> {
    // Serialize writes so an older snapshot cannot overwrite a newer total.
    const data = { version: 2, totals: { ...this.timer.totals }, statistics: JSON.parse(JSON.stringify(this.statistics.files)) };
    this.saves = this.saves.then(() => this.saveData(data)).then(() => {
      this.saveFailed = false;
    }).catch(error => {
      console.error('Status Bar File Timer: could not save totals', error);
      if (!this.saveFailed) new Notice('File timer totals could not be saved. Check vault storage.');
      this.saveFailed = true;
    });
    return this.saves;
  }

  rows(): StatsRow[] {
    return Object.entries(this.timer.totals).map(([path, total]) => ({ path, total, stats: this.statistics.get(path) }));
  }

  setMode(path: string, mode: Mode): void {
    this.tick();
    this.statistics.setMode(path, mode);
    void this.persist();
  }

  private async refreshWords(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    const path = file.path;
    try {
      const text = await this.app.vault.cachedRead(file);
      if (this.stopped || file.path !== path || this.app.vault.getAbstractFileByPath(path) !== file) return;
      // The editor is more current than a potentially pending disk save.
      const view = this.activeView();
      this.statistics.get(path).words = countWords(view instanceof MarkdownView && view.file === file ? view.editor.getValue() : text);
    } catch (error) { console.warn('File timer could not count words', error); }
  }

  private async showTotals(): Promise<void> {
    this.tick();
    let leaf = this.app.workspace.getLeavesOfType(STATS_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: STATS_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  onunload(): void {
    this.tick(true);
    this.stopped = true;
    void this.persist();
  }
}
