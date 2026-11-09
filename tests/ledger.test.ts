import assert from 'node:assert/strict';
import test from 'node:test';
import { Ledger, decodeDocument, encodeDocument, migrateLegacy, validateDocument } from '../src/ledger';
import { wpm } from '../src/stats';
const make = (id: string) => { let serial = 0; return new Ledger(id, () => String(++serial)); };

test('offline devices sum their own time and additions after exchanging snapshots', () => {
  const desktop = make('desktop'), android = make('android'), ios = make('ios');
  for (const device of [desktop, android, ios]) {
    device.record('Note.md', 60000, 20, 'writing', 100);
    device.words('Note.md', 120, 100);
  }
  const documents = [desktop, android, ios].map(device => structuredClone(device.local));
  for (const device of [desktop, android, ios]) for (const doc of documents) device.ingest(doc.id, doc);
  for (const device of [desktop, android, ios]) {
    const row = device.rows()[0];
    assert.equal(row.total, 180000); assert.equal(row.stats.added, 60);
    assert.equal(row.stats.words, 120); assert.equal(wpm(row.stats), 20);
  }
});
test('replayed, duplicated and out-of-order snapshots never double-count or roll back time', () => {
  const a = make('a'), b = make('b');
  a.record('A.md', 1000, 1, 'writing', 1);
  const old = structuredClone(a.local);
  a.record('A.md', 1000, 1, 'writing', 2);
  b.ingest('a', a.local); b.ingest('conflict-copy', a.local); b.ingest('a', old);
  assert.equal(b.rows()[0].total, 2000);
  assert.equal(b.rows()[0].stats.added, 2);
});
test('same-path text and mode changes are not summed; latest metadata wins on both devices', () => {
  const a = make('a'), b = make('b');
  a.record('A.md', 1000, 0, 'reading', 1); a.words('A.md', 100, 10); a.mode('A.md', 'reading', 10);
  b.record('A.md', 1000, 0, 'writing', 2); b.words('A.md', 50, 20); b.mode('A.md', 'writing', 20);
  a.ingest('b', b.local); b.ingest('a', a.local);
  assert.deepEqual(a.rows(), b.rows());
  assert.equal(a.rows()[0].stats.words, 50); assert.equal(a.rows()[0].stats.mode, 'writing');
});
test('renames follow stable contribution IDs, including later snapshots of an existing session', () => {
  const a = make('a'), b = make('b');
  a.record('folder/A.md', 1000, 0, 'reading', 1); b.ingest('a', a.local);
  b.move('folder', 'new', 2);
  a.record('folder/A.md', 1000, 0, 'reading', 3); b.ingest('a', a.local);
  assert.equal(b.rows()[0].path, 'new/A.md'); assert.equal(b.rows()[0].total, 2000);
  a.ingest('b', b.local);
  assert.deepEqual(a.rows(), b.rows());
  a.move('new', 'folder', 4);
  assert.equal(a.rows()[0].path, 'folder/A.md');
});
test('deletions survive stale sync, while a newly created file starts fresh', () => {
  const a = make('a'), b = make('b');
  a.record('A.md', 1000, 0, 'reading', 1); b.ingest('a', a.local); b.move('A.md', null, 2);
  b.ingest('stale-copy', a.local); assert.equal(b.rows().length, 0);
  b.record('A.md', 500, 0, 'reading', 3); assert.equal(b.rows()[0].total, 500);
});
test('legacy import preserves totals and reading backfill; mirrored imports do not duplicate', () => {
  const saved = { totals: { 'Clippings/A.md': 120000 }, statistics: { 'Clippings/A.md': { words: 600, readingMs: 60000, mode: 'reading' } } };
  const a = make('a');
  a.ingest('legacy-one', migrateLegacy(saved, 'legacy-one'));
  a.ingest('legacy-two', migrateLegacy(saved, 'legacy-two'));
  assert.equal(a.rows()[0].total, 120000); assert.equal(wpm(a.rows()[0].stats), 300);
  a.record('Clippings/A.md', 60000, 0, 'reading', 10);
  assert.equal(a.rows()[0].total, 180000); assert.equal(wpm(a.rows()[0].stats), 200);
});
test('portable Markdown roundtrip; invalid data is rejected without changing valid totals', () => {
  const a = make('a'); a.record('Clippings/你好.md', 1000, 0, 'reading', 1);
  assert.deepEqual(decodeDocument(encodeDocument(a.local)), a.local);
  for (const broken of [null, { ...a.local, version: 99 }, { ...a.local, entries: [{ ...a.local.entries[0], readingMs: -1 }] }, { ...a.local, entries: [{ ...a.local.entries[0], path: '../outside' }] }]) {
    assert.throws(() => validateDocument(broken));
  }
  assert.throws(() => decodeDocument('partial file'));
});
test('simultaneous mode changes converge deterministically; an explicit later choice can override clock skew', () => {
  const a = make('a'), b = make('b');
  a.mode('A.md', 'reading', 100); b.mode('A.md', 'writing', 100);
  a.ingest('b', b.local); b.ingest('a', a.local);
  assert.deepEqual(a.rows(), b.rows());
  a.mode('A.md', 'reading', 1); b.ingest('a', a.local);
  assert.equal(a.rows()[0].stats.mode, 'reading'); assert.equal(b.rows()[0].stats.mode, 'reading');
});

test('pause is per file, defaults off, and persists through serialization and a new session', () => {
  const a = make('a');
  assert.equal(a.isPaused('new.md'), false);
  a.pause('A.md', true, 10);
  assert.equal(a.isPaused('A.md'), true);
  assert.equal(a.isPaused('B.md'), false);
  const reopened = make('reopened');
  reopened.ingest('a', decodeDocument(encodeDocument(a.local)));
  assert.equal(reopened.isPaused('A.md'), true);
  assert.equal(reopened.isPaused('new.md'), false);
});
test('resume syncs and stale snapshots cannot re-pause a file; independent files stay paused', () => {
  const a = make('a'), b = make('b');
  a.pause('A.md', true, 10); a.pause('B.md', true, 10);
  const old = structuredClone(a.local);
  b.ingest('a', old); b.pause('A.md', false, 20);
  a.ingest('b', b.local); b.ingest('a', old);
  for (const ledger of [a, b]) {
    assert.equal(ledger.isPaused('A.md'), false);
    assert.equal(ledger.isPaused('B.md'), true);
  }
  a.pause('A.md', true, 1); b.ingest('a', a.local);
  assert.equal(b.isPaused('A.md'), true);
});
test('pause survives renames and clears when a deleted path is reused', () => {
  const a = make('a'); a.pause('folder/A.md', true, 10);
  a.move('folder', 'renamed', 20);
  assert.equal(a.isPaused('renamed/A.md'), true);
  assert.equal(a.isPaused('folder/A.md'), false);
  a.move('renamed/A.md', null, 30);
  assert.equal(a.isPaused('renamed/A.md'), false);
});
test('older data defaults to enabled and malformed pause metadata is rejected', () => {
  const a = make('a'); a.record('A.md', 1000, 0, 'reading', 1);
  assert.equal(decodeDocument(encodeDocument(a.local)).entries[0].paused, undefined);
  assert.equal(a.isPaused('A.md'), false);
  const bad = structuredClone(a.local);
  bad.entries[0].paused = true;
  assert.throws(() => validateDocument(bad), /pause preference/);
});
test('equal-time pause conflicts converge regardless of snapshot arrival order', () => {
  const a = make('a'), b = make('b');
  a.pause('A.md', true, 10); b.pause('A.md', false, 10);
  a.ingest('b', b.local); b.ingest('a', a.local);
  assert.equal(a.isPaused('A.md'), b.isPaused('A.md'));
});
