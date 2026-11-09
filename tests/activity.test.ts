import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldTrack } from '../src/activity';
const active = { mobile: false, visible: true, focused: true, suspended: false, paused: false, hasFile: true, inView: true };
test('desktop requires actual window focus', () => {
  assert.equal(shouldTrack(active), true);
  assert.equal(shouldTrack({ ...active, focused: false }), false);
});
test('mobile tolerates webview focus loss, but never hidden, suspended or manually paused views', () => {
  const mobile = { ...active, mobile: true, focused: false };
  assert.equal(shouldTrack(mobile), true);
  for (const state of [{ visible: false }, { suspended: true }, { paused: true }, { hasFile: false }, { inView: false }]) {
    assert.equal(shouldTrack({ ...mobile, ...state }), false);
  }
});

test('writing excludes initial note loads and synced replacements, but includes typing and paste', async () => {
  const { writtenWords } = await import('../src/activity');
  assert.equal(writtenWords('', 'one two three four', false), 0);
  assert.equal(writtenWords('one', 'one two three four', false), 0);
  assert.equal(writtenWords('one two three four', 'one two three four five six seven', true), 3);
  assert.equal(writtenWords('one two three four', 'one', true), 0);
});
