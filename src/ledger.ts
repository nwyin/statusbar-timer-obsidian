import { FileStatistics, FileStats, Mode } from './stats';

export const DATA_FOLDER = 'File Timer';
export const RECORDS_FOLDER = `${DATA_FOLDER}/sessions`;
export const isTimerData = (path: string): boolean => path === DATA_FOLDER || path.startsWith(DATA_FOLDER + '/');
export interface Entry {
  id: string;
  path: string;
  readingMs: number;
  writingMs: number;
  historicalMs: number;
  added: number;
  lastTracked: number;
  words: number | null;
  wordsAt: number;
  mode: Mode;
  modeAt: number;
}
export interface Change { id: string; target: string; path: string | null; at: number }
export interface LedgerDocument {
  format: 'statusbar-file-timer';
  version: 1;
  kind: 'session' | 'legacy';
  id: string;
  revision: number;
  entries: Entry[];
  changes: Change[];
}
export interface LedgerRow { path: string; total: number; stats: FileStats }
export function newDocument(id: string, kind: 'session' | 'legacy' = 'session'): LedgerDocument {
  return { format: 'statusbar-file-timer', version: 1, kind, id, revision: 0, entries: [], changes: [] };
}
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => part === '..' || part === '.') && !isTimerData(value);
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]+$/.test(value);
export function validateDocument(value: unknown): LedgerDocument {
  if (!value || typeof value !== 'object') throw new Error('Not a timer document');
  const d = value as LedgerDocument;
  if (d.format !== 'statusbar-file-timer' || d.version !== 1 || !validId(d.id)
    || !['session', 'legacy'].includes(d.kind) || !Number.isSafeInteger(d.revision) || d.revision < 0
    || !Array.isArray(d.entries) || !Array.isArray(d.changes)) throw new Error('Unsupported timer document');
  const ids = new Set<string>();
  for (const e of d.entries) {
    if (!e || typeof e !== 'object' || !validPath(e.path) || typeof e.id !== 'string'
      || (d.kind === 'legacy' ? e.id !== `legacy:${e.path}` : !e.id.startsWith(d.id + ':'))
      || ids.has(e.id) || !['reading', 'writing'].includes(e.mode)
      || !['readingMs', 'writingMs', 'historicalMs', 'added', 'lastTracked', 'wordsAt', 'modeAt'].every(key => numeric(e[key as keyof Entry]))
      || !(e.words === null || numeric(e.words))) throw new Error('Invalid timer entry');
    ids.add(e.id);
  }
  for (const c of d.changes) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id.startsWith(d.id + ':')
      || typeof c.target !== 'string' || !(c.path === null || validPath(c.path)) || !numeric(c.at)) throw new Error('Invalid timer change');
  }
  return structuredClone(d);
}
export function encodeDocument(document: LedgerDocument): string {
  return '# File Timer session\n\nManaged by Status Bar File Timer. Sync this file with your vault.\n\n```json\n'
    + JSON.stringify(document, null, 2) + '\n```\n';
}
export function decodeDocument(text: string): LedgerDocument {
  const match = text.match(/^```json\r?\n([\s\S]*?)\r?\n```\s*$/m);
  if (!match) throw new Error('Missing timer JSON block');
  return validateDocument(JSON.parse(match[1]));
}

export function mergeDocuments(a: LedgerDocument, b: LedgerDocument): LedgerDocument {
  if (a.id !== b.id || a.kind !== b.kind) throw new Error('Different session IDs at the same path');
  const [older, newer] = a.revision <= b.revision ? [a, b] : [b, a];
  const result = structuredClone(newer);
  const entries = new Map(older.entries.map(e => [e.id, { ...e }]));
  for (const entry of newer.entries) {
    const previous = entries.get(entry.id);
    const merged = { ...entry };
    if (previous) {
      for (const key of ['readingMs', 'writingMs', 'historicalMs', 'added', 'lastTracked'] as const) merged[key] = Math.max(previous[key], entry[key]);
      if (previous.modeAt > merged.modeAt) { merged.mode = previous.mode; merged.modeAt = previous.modeAt; }
      if (previous.wordsAt > merged.wordsAt) { merged.words = previous.words; merged.wordsAt = previous.wordsAt; }
    }
    entries.set(entry.id, merged);
  }
  result.entries = [...entries.values()];
  result.changes = [...new Map([...older.changes, ...newer.changes].map(c => [c.id, c])).values()];
  return result;
}

/** Single-writer session counters; duplicate/reordered snapshots merge by maxima. */
export class Ledger {
  readonly local: LedgerDocument;
  private documents = new Map<string, LedgerDocument>();
  private cached: { rows: LedgerRow[]; entries: Map<string, Entry>; paths: Map<string, string | null> } | null = null;
  constructor(id: string, private uuid: () => string = () => crypto.randomUUID()) { this.local = newDocument(id); }
  ingest(key: string, document: LedgerDocument): void {
    const incoming = validateDocument(document);
    const previous = this.documents.get(key);
    this.documents.set(key, previous?.id === incoming.id ? mergeDocuments(previous, incoming) : incoming);
    this.cached = null;
  }
  forget(key: string): void { this.documents.delete(key); this.cached = null; }
  private changed(): void { this.local.revision++; this.cached = null; }
  private merged() {
    if (this.cached) return this.cached;
    const entries = new Map<string, Entry>();
    const changes = new Map<string, Change>();
    for (const doc of [...this.documents.values(), this.local].sort((a, b) => a.id.localeCompare(b.id) || a.revision - b.revision)) {
      for (const source of doc.entries) {
        const e = entries.get(source.id);
        if (!e) { entries.set(source.id, { ...source }); continue; }
        for (const key of ['readingMs', 'writingMs', 'historicalMs', 'added', 'lastTracked'] as const) e[key] = Math.max(e[key], source[key]);
        if (source.wordsAt >= e.wordsAt && source.words !== null) { e.words = source.words; e.wordsAt = source.wordsAt; }
        if (source.modeAt >= e.modeAt) { e.mode = source.mode; e.modeAt = source.modeAt; }
      }
      for (const c of doc.changes) {
        const previous = changes.get(c.target);
        // A deleted contribution stays deleted; a new file gets new entry IDs.
        if (!previous || (previous.path !== null && (c.path === null || c.at > previous.at || (c.at === previous.at && c.id > previous.id)))) changes.set(c.target, c);
      }
    }
    const paths = new Map<string, string | null>();
    const rows = new Map<string, LedgerRow>();
    const metadata = new Map<string, { modeAt: number; modeId: string; wordsAt: number; wordsId: string }>();
    for (const e of [...entries.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const path = changes.has(e.id) ? changes.get(e.id)!.path : e.path;
      paths.set(e.id, path);
      if (path === null) continue;
      let row = rows.get(path);
      if (!row) {
        row = { path, total: 0, stats: { mode: e.mode, words: null, added: 0, readingMs: 0, writingMs: 0, historicalMs: 0, lastTracked: 0 } };
        rows.set(path, row);
        metadata.set(path, { modeAt: -1, modeId: '', wordsAt: -1, wordsId: '' });
      }
      for (const key of ['readingMs', 'writingMs', 'historicalMs', 'added'] as const) row.stats[key] += e[key];
      row.total += e.readingMs + e.writingMs + e.historicalMs;
      row.stats.lastTracked = Math.max(row.stats.lastTracked, e.lastTracked);
      const meta = metadata.get(path)!;
      if (e.modeAt > meta.modeAt || (e.modeAt === meta.modeAt && e.id > meta.modeId)) {
        row.stats.mode = e.mode; meta.modeAt = e.modeAt; meta.modeId = e.id;
      }
      if (e.words !== null && (e.wordsAt > meta.wordsAt || (e.wordsAt === meta.wordsAt && e.id > meta.wordsId))) {
        row.stats.words = e.words; meta.wordsAt = e.wordsAt; meta.wordsId = e.id;
      }
    }
    return this.cached = { rows: [...rows.values()], entries, paths };
  }
  rows(): LedgerRow[] { return this.merged().rows; }
  private entry(path: string): Entry {
    const merged = this.merged();
    let e = this.local.entries.find(entry => merged.paths.get(entry.id) === path);
    if (e) return e;
    const row = merged.rows.find(row => row.path === path);
    e = { id: this.local.id + ':' + this.uuid(), path, readingMs: 0, writingMs: 0, historicalMs: 0, added: 0, lastTracked: 0,
      words: null, wordsAt: 0, mode: row?.stats.mode ?? (/^clippings\//i.test(path) || /\/clippings\//i.test(path) ? 'reading' : 'writing'), modeAt: 0 };
    this.local.entries.push(e); this.changed(); return e;
  }
  record(path: string, ms: number, added: number, mode: Mode, now: number): void {
    if (!ms && !added) return;
    const e = this.entry(path);
    e[mode === 'reading' ? 'readingMs' : 'writingMs'] += ms;
    e.added += added;
    if (ms) e.lastTracked = Math.max(e.lastTracked, now);
    this.changed();
  }
  words(path: string, words: number, now: number): void {
    const e = this.entry(path);
    if (e.words === words) return;
    e.words = words; e.wordsAt = Math.max(now, e.wordsAt + 1); this.changed();
  }
  mode(path: string, mode: Mode, now: number): void {
    const e = this.entry(path);
    e.mode = mode;
    // Ensure a deliberate local change wins even after another device's clock skew.
    e.modeAt = Math.max(now, ...[...this.merged().entries.values()].filter(entry => this.merged().paths.get(entry.id) === path).map(entry => entry.modeAt + 1));
    this.changed();
  }
  move(oldPath: string, newPath: string | null, now: number): void {
    for (const [id, path] of this.merged().paths) {
      if (path !== null && (path === oldPath || path.startsWith(oldPath + '/'))) {
        this.local.changes.push({ id: this.local.id + ':' + this.uuid(), target: id,
          path: newPath === null ? null : newPath + path.slice(oldPath.length), at: now });
      }
    }
    this.changed();
  }
}

/** Mirrored pre-sync data shares stable entry IDs: importing twice does not add twice. */
export function migrateLegacy(saved: unknown, id: string): LedgerDocument {
  const doc = newDocument(id, 'legacy');
  if (!saved || typeof saved !== 'object') return doc;
  const data = saved as { totals?: unknown; statistics?: unknown };
  if (!data.totals || typeof data.totals !== 'object') return doc;
  const totals = Object.fromEntries(Object.entries(data.totals).filter(([path, ms]) => validPath(path) && numeric(ms)));
  const stats = new FileStatistics(data.statistics, totals);
  for (const [path, total] of Object.entries(totals)) {
    const s = stats.get(path);
    // Preserve total even if older data's classified time is inconsistent.
    const readingMs = Math.min(s.readingMs, total);
    const writingMs = Math.min(s.writingMs, total - readingMs);
    doc.entries.push({ id: `legacy:${path}`, path, readingMs, writingMs, historicalMs: total - readingMs - writingMs,
      added: s.added, lastTracked: s.lastTracked, words: s.words, wordsAt: 0, mode: s.mode, modeAt: 0 });
  }
  doc.revision = 1;
  return doc;
}
