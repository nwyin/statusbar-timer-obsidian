import { decodeDocument, encodeDocument, Ledger, LedgerDocument, mergeDocuments, RECORDS_FOLDER } from './ledger';

export interface LedgerIO {
  list(): string[];
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
}
/** Uses ordinary vault files; no platform-specific filesystem access. */
export class SyncStore {
  private generations = new Map<string, number>();
  constructor(readonly ledger: Ledger, private io: LedgerIO, private report: (path: string, error: unknown) => void) {}
  async load(): Promise<void> {
    // Sequential reads avoid flooding a mobile vault with simultaneous I/O.
    for (const path of this.io.list()) await this.receive(path);
  }
  async receive(path: string): Promise<void> {
    const generation = (this.generations.get(path) ?? 0) + 1;
    this.generations.set(path, generation);
    try {
      const text = await this.io.read(path);
      if (this.generations.get(path) !== generation) return;
      if (text === null) this.ledger.forget(path);
      else this.ledger.ingest(path, decodeDocument(text));
    } catch (error) {
      // Keep the last valid snapshot while a sync provider delivers a partial file.
      this.report(path, error);
    }
  }
  remove(path: string): void {
    this.generations.set(path, (this.generations.get(path) ?? 0) + 1);
    this.ledger.forget(path);
  }
  async write(document: LedgerDocument): Promise<void> {
    if (!document.entries.length && !document.changes.length) return;
    const path = `${RECORDS_FOLDER}/${document.id}.md`;
    const previous = await this.io.read(path);
    const merged = previous === null ? document : mergeDocuments(decodeDocument(previous), document);
    const text = encodeDocument(merged);
    if (text !== previous) await this.io.write(path, text);
    this.ledger.ingest(path, merged);
  }
}
