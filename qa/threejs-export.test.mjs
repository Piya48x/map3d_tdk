import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditLayoutAgainstBaseline, prepareBaselineRepair, embedLayoutInStandalone } from '../src/threejs-export.js';

const baseline = JSON.parse(readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'));
const unchanged = structuredClone(baseline);
assert.deepEqual(auditLayoutAgainstBaseline(unchanged, baseline), { ok: true, differences: [], addedCount: 0 });

const additive = structuredClone(baseline);
additive.objects['custom-blueCrate-export-test'] = {
    type: 'blueCrate', label: 'Export test',
    position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, renderMode: 'back'
};
additive.added.push({ id: 'custom-blueCrate-export-test', type: 'blueCrate' });
assert.deepEqual(auditLayoutAgainstBaseline(additive, baseline), { ok: true, differences: [], addedCount: 1 });

const changed = structuredClone(baseline);
changed.objects['building-main_office'].position.x += 1;
const changedAudit = auditLayoutAgainstBaseline(changed, baseline);
assert.equal(changedAudit.ok, false);
assert.ok(changedAudit.differences.includes('building-main_office (changed)'));

const drifted = structuredClone(additive);
delete drifted.objects['scene-meshm50mm76p85mm5p00m0p80m0p06m160p00-1'];
drifted.objects['scene-meshm85mm22p24m59p37m0p12m0p04m39p27-1'].position.x += 1;
drifted.objects['unregistered-scene-id'] = structuredClone(drifted.objects['custom-blueCrate-export-test']);
const repaired = prepareBaselineRepair(drifted, baseline, 'locked-baseline-id');
assert.deepEqual(repaired.droppedIds, ['unregistered-scene-id']);
assert.equal(repaired.keptCount, 1);
assert.deepEqual(repaired.layout.objects['scene-meshm50mm76p85mm5p00m0p80m0p06m160p00-1'],
    baseline.objects['scene-meshm50mm76p85mm5p00m0p80m0p06m160p00-1']);
assert.deepEqual(repaired.layout.objects['scene-meshm85mm22p24m59p37m0p12m0p04m39p27-1'],
    baseline.objects['scene-meshm85mm22p24m59p37m0p12m0p04m39p27-1']);
assert.deepEqual(repaired.layout.objects['custom-blueCrate-export-test'], additive.objects['custom-blueCrate-export-test']);
assert.equal(auditLayoutAgainstBaseline(repaired.layout, baseline).ok, true);

const template = readFileSync(new URL('../tdk-factory-map.js', import.meta.url), 'utf8');
const hostLine = template.split('\n').find(line => line.startsWith("const host=document.createElement('div');"));
const hostMarkup = JSON.parse(hostLine.slice(hostLine.indexOf('host.innerHTML=') + 'host.innerHTML='.length,
    hostLine.indexOf(';document.body.appendChild(host);')));
assert.ok(hostMarkup.includes('id="editor-export-threejs"'), 'Standalone host must include the export control used by its runtime');
assert.ok(hostMarkup.includes('id="editor-repair-baseline"'), 'Standalone host must include the baseline repair control');
const camera = { position: [8, 120, 170], target: [25, 2, 10], fov: 46 };
const bundle = embedLayoutInStandalone(template, additive, camera);
assert.ok(bundle.includes(`const embeddedLayout=${JSON.stringify(additive)},embeddedCamera=${JSON.stringify(camera)};`));
assert.equal((bundle.match(/^window\.TDK_EMBEDDED_FACTORY_LAYOUT=embeddedLayout;$/gm) || []).length, 1);
assert.doesNotThrow(() => new Function(bundle), 'Downloaded standalone bundle must parse as JavaScript');

console.log('PASS: locked-baseline audit and standalone Three.js layout embedding');
