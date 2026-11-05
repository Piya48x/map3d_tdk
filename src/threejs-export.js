const EMBEDDED_LAYOUT_START = 'const embeddedLayout=';
const EMBEDDED_LAYOUT_END = 'window.TDK_EMBEDDED_FACTORY_LAYOUT=embeddedLayout;';

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
        else if (!sameValue(currentObjects[id], expected)) differences.push(`${id} (changed)`);
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

/** Replace only the embedded data header; the self-contained Three.js runtime stays unchanged. */
export function embedLayoutInStandalone(template, layout, camera) {
    const start = template.indexOf(EMBEDDED_LAYOUT_START);
    const end = template.indexOf(EMBEDDED_LAYOUT_END, start);
    if (start < 0 || end < 0) throw new Error('Standalone Three.js template markers were not found.');
    const header = `${EMBEDDED_LAYOUT_START}${JSON.stringify(layout)},embeddedCamera=${JSON.stringify(camera)};\n`;
    return template.slice(0, start) + header + template.slice(end);
}

