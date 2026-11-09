import assert from 'node:assert/strict';
import test from 'node:test';
import { Ledger, encodeDocument, RECORDS_FOLDER } from '../src/ledger';
import { LedgerIO, SyncStore } from '../src/sync';
function vault() {
  const files = new Map<string, string>();
  const io: LedgerIO = { list: () => [...files.keys()], read: async path => files.get(path) ?? null, write: async (path, text) => { files.set(path, text); } };
  return { files, io };
}
test('two independent vault replicas converge after offline edits and repeated deliveries', async () => {
  const av = vault(), bv = vault();
  const a = new Ledger('a'), b = new Ledger('b');
  const as = new SyncStore(a, av.io, assert.fail), bs = new SyncStore(b, bv.io, assert.fail);
  a.record('A.md', 10000, 2, 'writing', 10); b.record('A.md', 20000, 3, 'writing', 20);
  await as.write(a.local); await bs.write(b.local);
  for (const [path, text] of av.files) bv.files.set(path, text);
  for (const [path, text] of bv.files) av.files.set(path, text);
  await as.load(); await bs.load(); await as.load(); await bs.load();
  assert.deepEqual(a.rows(), b.rows()); assert.equal(a.rows()[0].total, 30000);
  assert.equal(a.rows()[0].stats.added, 5);
});
test('a fresh session can recover a crash checkpoint without taking over its writer ID', async () => {
  const v = vault(), previous = new Ledger('old');
  previous.record('A.md', 1000, 0, 'reading', 1);
  const next = new Ledger('new'); const store = new SyncStore(next, v.io, assert.fail);
  await store.write(previous.local); next.record('A.md', 500, 0, 'reading', 2); await store.write(next.local);
  assert.equal(next.rows()[0].total, 1500); assert.equal(v.files.size, 2);
  const restarted = new Ledger('third'); const rs = new SyncStore(restarted, v.io, assert.fail);
  await rs.load(); await rs.write(previous.local);
  assert.equal(restarted.rows()[0].total, 1500);
});
test('partial sync writes retain last valid data and recover when the complete snapshot arrives', async () => {
  const v = vault(), remote = new Ledger('remote'), local = new Ledger('local');
  let failures = 0;
  const store = new SyncStore(local, v.io, () => { failures++; });
  const path = `${RECORDS_FOLDER}/remote.md`;
  remote.record('A.md', 1000, 0, 'reading', 1);
  v.files.set(path, encodeDocument(remote.local)); await store.receive(path);
  v.files.set(path, 'broken'); await store.receive(path);
  assert.equal(local.rows()[0].total, 1000); assert.equal(failures, 1);
  remote.record('A.md', 1000, 0, 'reading', 2);
  v.files.set(path, encodeDocument(remote.local)); await store.receive(path);
  assert.equal(local.rows()[0].total, 2000);
});
test('failed writes reject and leave existing file intact; a retry saves the same counters once', async () => {
  const v = vault(), ledger = new Ledger('a');
  ledger.record('A.md', 1000, 0, 'reading', 1);
  const store = new SyncStore(ledger, { ...v.io, write: async () => { throw new Error('disk full'); } }, assert.fail);
  await assert.rejects(store.write(ledger.local), /disk full/); assert.equal(v.files.size, 0);
  const retry = new SyncStore(ledger, v.io, assert.fail); await retry.write(ledger.local); await retry.write(ledger.local);
  assert.equal(v.files.size, 1); assert.equal(ledger.rows()[0].total, 1000);
});
test('deletion wins over a pending read and invalid own snapshots are never overwritten', async () => {
  const remote = new Ledger('remote'); remote.record('A.md', 1000, 0, 'reading', 1);
  let finish!: (text: string) => void;
  const ledger = new Ledger('local');
  const store = new SyncStore(ledger, { list: () => [], read: () => new Promise(resolve => { finish = resolve; }), write: async () => {} }, assert.fail);
  const path = `${RECORDS_FOLDER}/remote.md`;
  const pending = store.receive(path); store.remove(path); finish(encodeDocument(remote.local)); await pending;
  assert.equal(ledger.rows().length, 0);
  const v = vault(); v.files.set(path, 'broken'); const guarded = new SyncStore(remote, v.io, assert.fail);
  await assert.rejects(guarded.write(remote.local)); assert.equal(v.files.get(path), 'broken');
});
