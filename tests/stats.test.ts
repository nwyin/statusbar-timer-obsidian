import assert from 'node:assert/strict';
import test from 'node:test';
import { countWords, FileStatistics, wpm } from '../src/stats';

test('counts prose while excluding frontmatter, code, images and link targets', () => {
  assert.equal(countWords('---\ntitle: metadata\n---\n# Hello world\n[three words here](https://example.com)\n![image](x)\n```js\nconst ignored = 1;\n```'), 5);
  assert.equal(countWords("café don't 123"), 3);
});
test('defaults clippings to reading and other notes to writing', () => {
  const stats = new FileStatistics();
  assert.equal(stats.get('Clippings/Article.md').mode, 'reading');
  assert.equal(stats.get('Essay.md').mode, 'writing');
});
test('writing counts positive changes only, never initial content or background changes', () => {
  const stats = new FileStatistics();
  stats.sample('A.md', 100, false);
  stats.sample('A.md', 120, true);
  stats.sample('A.md', 110, true);
  stats.sample(null, null, false);
  stats.sample('A.md', 200, false);
  stats.sample('A.md', 210, true);
  stats.credit('A.md', 60000, 123456);
  assert.equal(stats.get('A.md').added, 30);
  assert.equal(wpm(stats.get('A.md')), 30);
  assert.equal(stats.get('A.md').lastTracked, 123456);
});
test('reading estimates one full read and modes retain independent denominators', () => {
  const stats = new FileStatistics();
  stats.sample('Clippings/A.md', 300, false);
  stats.credit('Clippings/A.md', 60000, 100);
  assert.equal(wpm(stats.get('Clippings/A.md')), 300);
  stats.setMode('Clippings/A.md', 'writing');
  assert.equal(wpm(stats.get('Clippings/A.md')), null);
  stats.sample('Clippings/A.md', 300, false);
  stats.sample('Clippings/A.md', 310, true);
  stats.credit('Clippings/A.md', 30000, 200);
  assert.equal(wpm(stats.get('Clippings/A.md')), 20);
});
test('stats survive serialization, folder rename and deletion', () => {
  const stats = new FileStatistics();
  stats.credit('folder/A.md', 1000, 99);
  const loaded = new FileStatistics(JSON.parse(JSON.stringify(stats.files)));
  loaded.rename('folder', 'new');
  assert.equal(loaded.get('new/A.md').writingMs, 1000);
  loaded.remove('new');
  assert.equal(Object.keys(loaded.files).length, 0);
});
test('legacy and malformed data do not invent historical word stats', () => {
  const stats = new FileStatistics({ 'A.md': { added: -1, writingMs: 'bad' } });
  assert.equal(stats.get('A.md').added, 0);
  assert.equal(wpm(stats.get('A.md')), null);
});
