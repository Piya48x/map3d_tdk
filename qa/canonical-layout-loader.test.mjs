import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANONICAL_LAYOUT_ID, selectStartupLayout } from '../src/canonical-layout-loader.js';

const canonical = JSON.parse(readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'));
const deployment = JSON.parse(readFileSync(new URL('../deployments/viewer-layout-2026-11-17.json', import.meta.url), 'utf8'));

assert.equal(selectStartupLayout(null, canonical), canonical, 'No storage must use the canonical snapshot');
assert.equal(selectStartupLayout({ revision: 12, objects: { old: {} } }, canonical), canonical,
    'Unmarked legacy storage must not override the canonical snapshot');
assert.equal(selectStartupLayout({ canonicalBaseline: 'older-baseline', revision: 12 }, canonical), canonical,
    'Storage from another baseline must not override the canonical snapshot');

const currentEdit = structuredClone(canonical);
currentEdit.canonicalBaseline = CANONICAL_LAYOUT_ID;
currentEdit.objects['custom-blueCrate-loader-test'] = {};
assert.equal(selectStartupLayout(currentEdit, canonical), canonical,
    'Viewer mode must ignore local edits so every origin renders the same map');
assert.equal(selectStartupLayout(currentEdit, canonical, { deploymentLayout: deployment }), deployment,
    'Viewer mode must use the versioned deployment layout with recovered additions');
const restoredEdit = selectStartupLayout(currentEdit, canonical, { allowSavedLayout: true });
assert.notEqual(restoredEdit, currentEdit, 'Startup must not mutate the saved localStorage value in memory');
assert.ok(Object.hasOwn(restoredEdit.objects, 'custom-blueCrate-loader-test'),
    'Local editor mode must retain additions saved against the current canonical snapshot');
assert.deepEqual(
    restoredEdit.objects['scene-entrymboommbarriermm28p40m74p20m10p29m1p83m0p82-1'].position,
    { x: 2.75, y: 0, z: 92.75 },
    'The approved entry barrier move must override a stale saved layout'
);
assert.deepEqual(
    restoredEdit.objects['scene-exitmboommbarriermm8p60m74p20m10p29m1p83m0p82-1'].position,
    { x: 22.5, y: 0, z: 92.75 },
    'The approved exit barrier move must override a stale saved layout'
);
assert.deepEqual(
    currentEdit.objects['scene-entrymboommbarriermm28p40m74p20m10p29m1p83m0p82-1'].position,
    canonical.objects['scene-entrymboommbarriermm28p40m74p20m10p29m1p83m0p82-1'].position,
    'Applying startup transforms must not mutate the parsed saved layout'
);

console.log('PASS: canonical startup layout selection across local and deployed origins');
