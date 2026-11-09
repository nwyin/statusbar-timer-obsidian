export type Mode = 'reading' | 'writing';
export interface FileStats {
  mode: Mode;
  words: number | null;
  added: number;
  readingMs: number;
  writingMs: number;
  lastTracked: number;
}
export function countWords(markdown: string): number {
  const text = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '').replace(/<[^>]*>/g, '');
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
export class FileStatistics {
  readonly files: Record<string, FileStats> = Object.create(null);
  private baseline: { path: string; words: number } | null = null;
  constructor(saved?: unknown) {
    if (!saved || typeof saved !== 'object') return;
    for (const [path, value] of Object.entries(saved)) {
      if (!value || typeof value !== 'object') continue;
      const s = value as Partial<FileStats>;
      const stat = this.get(path);
      if (s.mode === 'reading' || s.mode === 'writing') stat.mode = s.mode;
      for (const key of ['added', 'readingMs', 'writingMs', 'lastTracked', 'words'] as const) {
        const n = s[key];
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) stat[key] = n;
      }
    }
  }
  get(path: string): FileStats {
    return this.files[path] ??= {
      mode: /(^|\/)clippings\//i.test(path) ? 'reading' : 'writing',
      words: null, added: 0, readingMs: 0, writingMs: 0, lastTracked: 0,
    };
  }
  credit(path: string, ms: number, now: number): void {
    const stat = this.get(path);
    stat[stat.mode === 'reading' ? 'readingMs' : 'writingMs'] += ms;
    stat.lastTracked = now;
  }
  sample(path: string | null, words: number | null, continuous: boolean): void {
    if (path === null || words === null) { this.baseline = null; return; }
    const stat = this.get(path);
    stat.words = words;
    if (continuous && this.baseline?.path === path && stat.mode === 'writing') {
      stat.added += Math.max(0, words - this.baseline.words);
    }
    this.baseline = { path, words };
  }
  setMode(path: string, mode: Mode): void { this.get(path).mode = mode; this.baseline = null; }
  rename(oldPath: string, newPath: string): void {
    for (const path of Object.keys(this.files)) {
      if (path === oldPath || path.startsWith(oldPath + '/')) {
        this.files[newPath + path.slice(oldPath.length)] = this.files[path]; delete this.files[path];
      }
    }
    this.baseline = null;
  }
  remove(path: string): void {
    for (const key of Object.keys(this.files)) if (key === path || key.startsWith(path + '/')) delete this.files[key];
    this.baseline = null;
  }
}
export function wpm(stat: FileStats): number | null {
  const ms = stat.mode === 'reading' ? stat.readingMs : stat.writingMs;
  const words = stat.mode === 'reading' ? stat.words : stat.added;
  return ms >= 1000 && words !== null ? words * 60000 / ms : null;
}
