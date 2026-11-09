import { FileView, Modal, Notice, Plugin } from 'obsidian';
import { FileTimer, formatTime } from './timer';

export default class StatusBarFileTimer extends Plugin {
  private timer = new FileTimer();
  private status!: HTMLElement;
  private paused = false;
  private stopped = false;
  private windows = new Set<Window>();
  private saves: Promise<void> = Promise.resolve();
  private saveFailed = false;

  async onload(): Promise<void> {
    const saved = await this.loadData();
    this.timer = new FileTimer(saved?.totals);
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
      this.timer.rename(oldPath, file.path); this.transition();
    }));
    this.registerEvent(this.app.vault.on('delete', file => {
      this.timer.remove(file.path); this.transition();
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
    this.timer.update(Date.now(), running ? view.file!.path : null);
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
    const data = { version: 1, totals: { ...this.timer.totals } };
    this.saves = this.saves.then(() => this.saveData(data)).then(() => {
      this.saveFailed = false;
    }).catch(error => {
      console.error('Status Bar File Timer: could not save totals', error);
      if (!this.saveFailed) new Notice('File timer totals could not be saved. Check vault storage.');
      this.saveFailed = true;
    });
    return this.saves;
  }

  private showTotals(): void {
    this.tick();
    const modal = new Modal(this.app);
    modal.titleEl.setText('File time totals');
    const entries = Object.entries(this.timer.totals).sort((a, b) => b[1] - a[1]);
    if (!entries.length) modal.contentEl.createEl('p', { text: 'No tracked time yet.' });
    for (const [path, ms] of entries) {
      const row = modal.contentEl.createDiv({ cls: 'file-timer-total' });
      row.createSpan({ text: path });
      row.createEl('code', { text: formatTime(ms) });
    }
    modal.open();
  }

  onunload(): void {
    this.timer.update(Date.now(), null);
    this.stopped = true;
    void this.persist();
  }
}
