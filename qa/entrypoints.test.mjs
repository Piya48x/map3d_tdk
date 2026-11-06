import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');
const vercelIgnore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');

assert.ok(index.includes("location.hostname === '127.0.0.1' || location.hostname === 'localhost'"));
assert.ok(index.includes('window.TDK_VIEWER_ONLY = !(localEditorHost'));
assert.ok(editor.includes("location.replace('./index.html?editor=1')"));
assert.ok(vercelIgnore.split(/\r?\n/).includes('editor.html'), 'Production deployment must exclude editor.html');

console.log('PASS: local editor and production viewer entry points are separated');
