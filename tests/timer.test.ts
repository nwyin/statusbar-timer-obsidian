import assert from 'node:assert/strict';
import test from 'node:test';
import { FileTimer, formatTime } from '../src/timer';

test('switches files without assigning the previous interval to the new file', () => {
  const timer = new FileTimer();
  timer.update(0, 'A.md'); timer.update(1000, 'A.md');
  timer.update(1500, 'B.md'); timer.update(2500, null);
  assert.equal(timer.totals['A.md'], 1500);
  assert.equal(timer.totals['B.md'], 1000);
});
test('blur and manual pause exclude all time until focus resumes', () => {
  const timer = new FileTimer();
  timer.update(0, 'A.md'); timer.update(500, null);
  timer.update(1500, null); timer.update(2500, 'A.md'); timer.update(3500, null);
  assert.equal(timer.totals['A.md'], 1500);
});
test('sleep and backward clock jumps do not accrue time', () => {
  const timer = new FileTimer();
  timer.update(0, 'A.md'); timer.update(60000, 'A.md');
  timer.update(59000, 'A.md'); timer.update(60000, 'A.md');
  assert.equal(timer.totals['A.md'], 1000);
});
test('reopening preserves totals without counting closed time', () => {
  const timer = new FileTimer({ 'A.md': 1200 });
  timer.update(100000, 'A.md'); timer.update(101000, null);
  assert.equal(timer.totals['A.md'], 2200);
});
test('folder rename preserves totals and running path; deletion removes descendants only', () => {
  const timer = new FileTimer({ 'old/A.md': 1000, 'older/B.md': 2000 });
  timer.update(0, 'old/A.md'); timer.rename('old', 'new'); timer.update(1000, null);
  assert.equal(timer.totals['new/A.md'], 2000);
  assert.equal(timer.totals['old/A.md'], undefined);
  timer.remove('new');
  assert.equal(timer.totals['new/A.md'], undefined);
  assert.equal(timer.totals['older/B.md'], 2000);
});
test('rejects invalid saved totals and supports arbitrary file names', () => {
  const timer = new FileTimer(JSON.parse('{"__proto__":10,"bad":-1,"wrong":"20","valid":2500}'));
  assert.equal(timer.totals['__proto__'], 10);
  assert.equal(timer.totals.bad, undefined);
  assert.equal(timer.totals.wrong, undefined);
  assert.equal(timer.totals.valid, 2500);
});
test('formats cumulative hours without wrapping at a day', () => {
  assert.equal(formatTime(90061000), '25:01:01');
  assert.equal(formatTime(999), '00:00:00');
});
