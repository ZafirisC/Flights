// index.html must modulepreload exactly the modules reachable from js/main.js (start-up speed; see index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

function importGraph(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const [, rel] of src.matchAll(/(?:import|from)\s*\(?\s*['"](\.\/[^'"]+)['"]/g)) stack.push(normalize(join(dirname(file), rel)));
  }
  return [...seen].sort();
}

test('modulepreload list matches the import graph', () => {
  const html = readFileSync('index.html', 'utf8');
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(preloaded, importGraph('js/main.js'));
});
