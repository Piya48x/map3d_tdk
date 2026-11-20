import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/entry.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.ok(index.includes('src="./src/entry.js"'));
assert.ok(!index.includes('cdn.jsdelivr.net'), 'Vite entry must use the pinned npm Three.js dependency');
assert.ok(!index.includes('type="importmap"'));
assert.equal(existsSync(new URL('../editor.html', import.meta.url)), false,
    'index.html must be the only application HTML entry');
assert.ok(entry.includes('window.TDK_VIEWER_ONLY = false'));
assert.ok(entry.includes('window.TDK_START_IN_EDITOR = true'));
assert.ok(!entry.includes('location.search'), 'Entry mode must not depend on URL query parameters');
assert.ok(main.includes('window.TDK_START_IN_EDITOR === true'));
assert.ok(!main.includes("startupParams.get('editor')"),
    'Root and legacy ?editor=1 URLs must use the same startup mode');
assert.equal(rootPackage.scripts.dev, 'vite');
assert.equal(rootPackage.dependencies.three, '0.169.0');
assert.ok(rootPackage.scripts['build:standalone']);

console.log('PASS: index.html is the single editor-first Vite entry');
