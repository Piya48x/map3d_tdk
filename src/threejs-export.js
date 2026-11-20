const EMBEDDED_LAYOUT_START = 'const embeddedLayout=';
const EMBEDDED_LAYOUT_END = 'window.TDK_EMBEDDED_FACTORY_LAYOUT=embeddedLayout;';

// Explicitly requested on 2026-11-19: move the two existing boom barriers
// from the parking area to the factory entry/exit lanes. Every other baseline
// field remains immutable, and only these exact positions are accepted.
export const AUTHORIZED_EXISTING_OBJECT_TRANSFORMS = Object.freeze({
    'scene-entrymboommbarriermm28p40m74p20m10p29m1p83m0p82-1': Object.freeze({
        position: Object.freeze({ x: 2.75, y: 0, z: 92.75 })
    }),
    'scene-exitmboommbarriermm8p60m74p20m10p29m1p83m0p82-1': Object.freeze({
        position: Object.freeze({ x: 22.5, y: 0, z: 92.75 })
    })
});

function sameValue(left, right) {
    if (typeof left === 'number' && typeof right === 'number') {
        return left === right || Math.abs(left - right) <= 1e-9;
    }
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right) &&
            left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length &&
        leftKeys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function addedId(entry) {
    return typeof entry === 'string' ? entry : entry?.id;
}

function sameStringSet(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const rightSorted = [...right].sort();
    return [...left].sort().every((value, index) => value === rightSorted[index]);
}

/**
 * Enforce the locked 2026-11-05 map. Existing records must remain byte-for-byte
 * equivalent as data; only new stable IDs represented in `added` are accepted.
 */
export function auditLayoutAgainstBaseline(layout, baseline) {
    const differences = [];
    if (layout?.revision !== baseline?.revision) {
        differences.push(`revision (expected ${baseline?.revision})`);
    }

    const currentObjects = layout?.objects || {};
    const baselineObjects = baseline?.objects || {};
    for (const [id, expected] of Object.entries(baselineObjects)) {
        if (!Object.hasOwn(currentObjects, id)) differences.push(`${id} (missing)`);
        else if (!sameValue(currentObjects[id], expected)) {
            const authorizedTransform = AUTHORIZED_EXISTING_OBJECT_TRANSFORMS[id];
            const authorizedRecord = authorizedTransform
                ? { ...expected, ...authorizedTransform }
                : null;
            if (!authorizedRecord || !sameValue(currentObjects[id], authorizedRecord)) {
                differences.push(`${id} (changed)`);
            }
        }
    }

    const currentAdded = Array.isArray(layout?.added) ? layout.added : [];
    const baselineAdded = Array.isArray(baseline?.added) ? baseline.added : [];
    const currentAddedById = new Map(currentAdded.map(entry => [addedId(entry), entry]));
    for (const expected of baselineAdded) {
        const id = addedId(expected);
        if (!currentAddedById.has(id)) differences.push(`${id} (removed from added)`);
        else if (!sameValue(currentAddedById.get(id), expected)) differences.push(`${id} (added record changed)`);
    }

    const baselineIds = new Set(Object.keys(baselineObjects));
    const newObjectIds = Object.keys(currentObjects).filter(id => !baselineIds.has(id));
    const newAddedIds = currentAdded.map(addedId).filter(id => !baselineIds.has(id));
    const uniqueNewAddedIds = new Set(newAddedIds);
    for (const id of newObjectIds) {
        if (!uniqueNewAddedIds.has(id)) differences.push(`${id} (new object is not registered in added)`);
    }
    for (const id of uniqueNewAddedIds) {
        if (!id || !Object.hasOwn(currentObjects, id)) differences.push(`${id || '(empty id)'} (added object missing)`);
    }
    if (newAddedIds.length !== uniqueNewAddedIds.size) differences.push('added contains duplicate IDs');

    if (!sameStringSet(layout?.deleted, baseline?.deleted)) differences.push('deleted objects changed');
    if (!sameValue(layout?.cuts, baseline?.cuts)) differences.push('wall cuts changed');

    return { ok: differences.length === 0, differences, addedCount: newObjectIds.length };
}

/** Prepare an explicit local repair without changing the locked snapshot. */
export function prepareBaselineRepair(layout, baseline, canonicalBaselineId) {
    const baselineIds = new Set(Object.keys(baseline.objects || {}));
    const keptIds = new Set();
    const newAdded = [];
    const newObjects = {};
    for (const entry of layout.added || []) {
        const id = addedId(entry);
        if (!id || baselineIds.has(id) || keptIds.has(id) || !Object.hasOwn(layout.objects || {}, id)) continue;
        keptIds.add(id);
        newAdded.push(structuredClone(entry));
        newObjects[id] = structuredClone(layout.objects[id]);
    }
    const droppedIds = Object.keys(layout.objects || {}).filter(id => !baselineIds.has(id) && !keptIds.has(id));
    const repaired = {
        revision: baseline.revision,
        canonicalBaseline: canonicalBaselineId,
        objects: { ...structuredClone(baseline.objects), ...newObjects },
        added: [...structuredClone(baseline.added), ...newAdded],
        deleted: structuredClone(baseline.deleted),
        cuts: structuredClone(baseline.cuts)
    };
    const audit = auditLayoutAgainstBaseline(repaired, baseline);
    if (!audit.ok) throw new Error(`Baseline repair failed: ${audit.differences.join(', ')}`);
    return { layout: repaired, keptCount: newAdded.length, droppedIds };
}

/** Replace only the embedded data header; the self-contained Three.js runtime stays unchanged. */
export function embedLayoutInStandalone(template, layout, camera) {
    const start = template.indexOf(EMBEDDED_LAYOUT_START);
    const end = template.indexOf(EMBEDDED_LAYOUT_END, start);
    if (start < 0 || end < 0) throw new Error('Standalone Three.js template markers were not found.');
    const header = `${EMBEDDED_LAYOUT_START}${JSON.stringify(layout)},embeddedCamera=${JSON.stringify(camera)};\n`;
    return template.slice(0, start) + header + template.slice(end);
}

