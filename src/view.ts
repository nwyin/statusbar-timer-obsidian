import { ItemView, WorkspaceLeaf } from 'obsidian';
import { FileStats, Mode, wpm } from './stats';
import { formatTime } from './timer';
export const STATS_VIEW = 'statusbar-file-timer-stats';
export interface StatsRow { path: string; total: number; stats: FileStats; paused: boolean }
export interface StatsSource {
  rows(): StatsRow[];
  setMode(path: string, mode: Mode): void;
  togglePause(path?: string): void;
  trackingState(): { paused: boolean; text: string; path: string | null };
}
export class TimerStatsView extends ItemView {
  private sort = 'recent';
  private query = '';
  private body!: HTMLElement;
  private summary!: HTMLElement;
  private pauseButton!: HTMLButtonElement;
  private activity!: HTMLElement;
  constructor(leaf: WorkspaceLeaf, private source: StatsSource) { super(leaf); }
  getViewType(): string { return STATS_VIEW; }
  getDisplayText(): string { return 'File time & words'; }
  getIcon(): string { return 'chart-no-axes-column'; }
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('file-timer-pane');
    this.contentEl.createEl('h2', { text: 'File time & words' });
    const activity = this.contentEl.createDiv({ cls: 'file-timer-activity' });
    this.activity = activity.createSpan();
    this.pauseButton = activity.createEl('button', { text: 'Pause tracking' });
    this.pauseButton.addEventListener('click', () => { this.source.togglePause(); this.refresh(); });
    const controls = this.contentEl.createDiv({ cls: 'file-timer-controls' });
    const search = controls.createEl('input', { type: 'search', placeholder: 'Filter files…' });
    search.setAttribute('aria-label', 'Filter tracked files');
    search.addEventListener('input', () => { this.query = search.value.toLowerCase(); this.refresh(); });
    const sort = controls.createEl('select');
    sort.setAttribute('aria-label', 'Sort tracked files');
    for (const [value, text] of [['time', 'Total time ↓'], ['recent', 'Recently tracked ↓'], ['name', 'File name A–Z'], ['wpm', 'WPM ↓'], ['words', 'Words added ↓']]) {
      sort.createEl('option', { value, text });
    }
    sort.value = this.sort;
    sort.addEventListener('change', () => { this.sort = sort.value; this.refresh(); });
    this.summary = this.contentEl.createEl('p', { cls: 'file-timer-summary' });
    const help = this.contentEl.createEl('details', { cls: 'file-timer-help' });
    help.createEl('summary', { text: 'How WPM is calculated' });
    help.createEl('p', { text: 'Reading WPM ≈ document words ÷ reading minutes (assumes one full read). Writing WPM = positive word-count changes ÷ writing minutes; includes pasted text. Reading estimates include historical time from before word tracking. Writing WPM uses observed edits only; historical writing cannot be reconstructed.' });
    this.body = this.contentEl.createDiv({ cls: 'file-timer-table-wrap' });
    this.refresh();
    this.registerInterval(window.setInterval(() => {
      // Keep keyboard focus and open mode menus intact during live refreshes.
      if (!this.body.contains(this.contentEl.ownerDocument.activeElement)) this.refresh();
    }, 5000));
  }
  refresh(): void {
    if (!this.body) return;
    const state = this.source.trackingState();
    this.activity.setText(state.text);
    this.pauseButton.setText(state.paused ? 'Resume this file' : 'Pause this file');
    this.pauseButton.setAttribute('aria-pressed', String(state.paused));
    this.pauseButton.disabled = state.path === null;
    const rows = this.source.rows().filter(row => row.path.toLowerCase().includes(this.query));
    rows.sort((a, b) => {
      const difference = this.sort === 'recent' ? b.stats.lastTracked - a.stats.lastTracked
        : this.sort === 'wpm' ? (wpm(b.stats) ?? -1) - (wpm(a.stats) ?? -1)
        : this.sort === 'words' ? b.stats.added - a.stats.added
        : this.sort === 'name' ? 0 : b.total - a.total;
      return difference || a.path.localeCompare(b.path);
    });
    this.summary.setText(`${rows.length} files · ${formatTime(rows.reduce((sum, row) => sum + row.total, 0))} total`);
    this.body.empty();
    if (!rows.length) { this.body.createEl('p', { text: 'No tracked files match. Open a note to start tracking.' }); return; }
    const table = this.body.createEl('table');
    const header = table.createEl('thead').createEl('tr');
    for (const text of ['File', 'Total time', 'Last tracked', 'Mode', 'Document words', 'Words added', 'WPM', 'Tracking']) header.createEl('th', { text, attr: { scope: 'col' } });
    const tbody = table.createEl('tbody');
    for (const row of rows) {
      const tr = tbody.createEl('tr');
      const link = tr.createEl('td').createEl('a', { text: row.path, href: '#', cls: 'internal-link' });
      link.addEventListener('click', event => { event.preventDefault(); void this.app.workspace.openLinkText(row.path, '', true); });
      tr.createEl('td', { text: formatTime(row.total) });
      tr.createEl('td', { text: row.stats.lastTracked ? new Date(row.stats.lastTracked).toLocaleString() : 'Before update' });
      const mode = tr.createEl('td').createEl('select');
      mode.setAttribute('aria-label', `Tracking mode for ${row.path}`);
      mode.createEl('option', { value: 'reading', text: 'Reading' });
      mode.createEl('option', { value: 'writing', text: 'Writing' });
      mode.value = row.stats.mode;
      mode.addEventListener('change', () => { this.source.setMode(row.path, mode.value as Mode); this.refresh(); });
      const markdown = row.path.toLowerCase().endsWith('.md');
      tr.createEl('td', { text: markdown && row.stats.words !== null ? String(row.stats.words) : '—' });
      tr.createEl('td', { text: markdown ? String(row.stats.added) : '—' });
      const rate = markdown ? wpm(row.stats) : null;
      const rateCell = tr.createEl('td', { text: rate === null ? '—' : `${row.stats.mode === 'reading' ? '≈ ' : ''}${rate.toFixed(1)}` });
      const pause = tr.createEl('td').createEl('button', { text: row.paused ? 'Resume' : 'Pause' });
      pause.setAttribute('aria-label', `${row.paused ? 'Resume' : 'Pause'} tracking for ${row.path}`);
      pause.setAttribute('aria-pressed', String(row.paused));
      pause.addEventListener('click', () => { this.source.togglePause(row.path); this.refresh(); });
      const labels = ['File', 'Total time', 'Last tracked', 'Mode', 'Document words', 'Words added', 'WPM', 'Tracking'];
      Array.from(tr.children).forEach((cell, index) => cell.setAttribute('data-label', labels[index]));
      if (row.stats.mode === 'reading' && row.stats.historicalMs > 0) {
        rateCell.setAttribute('title', `Includes ${formatTime(row.stats.historicalMs)} of historical time, assumed to be reading. Uses the current document word count.`);
      }
    }
  }
}
