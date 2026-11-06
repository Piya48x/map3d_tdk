import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANONICAL_LAYOUT_ID, selectStartupLayout } from '../src/canonical-layout-loader.js';

const canonical = JSON.parse(readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'));

assert.equal(selectStartupLayout(null, canonical), canonical, 'No storage must use the canonical snapshot');
assert.equal(selectStartupLayout({ revision: 12, objects: { old: {} } }, canonical), canonical,
    'Unmarked legacy storage must not override the canonical snapshot');
assert.equal(selectStartupLayout({ canonicalBaseline: 'older-baseline', revision: 12 }, canonical), canonical,
    'Storage from another baseline must not override the canonical snapshot');

const currentEdit = structuredClone(canonical);
currentEdit.canonicalBaseline = CANONICAL_LAYOUT_ID;
currentEdit.objects['custom-blueCrate-loader-test'] = {};
assert.equal(selectStartupLayout(currentEdit, canonical), currentEdit,
    'Edits saved against the current canonical snapshot must survive reloads');

console.log('PASS: canonical startup layout selection across local and deployed origins');
