import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/entry.js', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');
const vercelIgnore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.ok(index.includes('src="./src/entry.js"'));
assert.ok(!index.includes('cdn.jsdelivr.net'), 'Vite entry must use the pinned npm Three.js dependency');
assert.ok(!index.includes('type="importmap"'));
assert.ok(entry.includes("location.hostname === '127.0.0.1' || location.hostname === 'localhost'"));
assert.ok(entry.includes('window.TDK_VIEWER_ONLY = !(localEditorHost'));
assert.ok(editor.includes("location.replace('./index.html?editor=1')"));
assert.ok(vercelIgnore.split(/\r?\n/).includes('editor.html'), 'Production deployment must exclude editor.html');
assert.equal(rootPackage.scripts.dev, 'vite');
assert.equal(rootPackage.dependencies.three, '0.169.0');
assert.ok(rootPackage.scripts['build:standalone']);

console.log('PASS: Vite entry, local editor, production viewer, and standalone scripts are separated');
