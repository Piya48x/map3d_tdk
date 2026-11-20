import {
    AUTHORIZED_EXISTING_OBJECT_TRANSFORMS,
    auditLayoutAgainstBaseline
} from './threejs-export.js';

export const CANONICAL_LAYOUT_ID = 'baseline-2026-11-05:484e73bd8d90898842a3621624d3c227acfb5d4369e473991076bb5ea934ae4d';
export const CANONICAL_LAYOUT_SHA256 = '484e73bd8d90898842a3621624d3c227acfb5d4369e473991076bb5ea934ae4d';
export const DEPLOYMENT_LAYOUT_ID = 'viewer-layout-2026-11-17';
export const DEPLOYMENT_LAYOUT_SHA256 = 'ad2e98e3b77fa3ac33d85278e53cabce24d1d379b5e95cd354b21fa8a457ab86';
export const EDITOR_STORAGE_KEY = 'tdk-v7-object-layout-v1';

function applyAuthorizedTransforms(layout) {
    if (!layout?.objects) return layout;
    const transformed = structuredClone(layout);
    for (const [id, transform] of Object.entries(AUTHORIZED_EXISTING_OBJECT_TRANSFORMS)) {
        if (!Object.hasOwn(transformed.objects, id)) continue;
        transformed.objects[id] = { ...transformed.objects[id], ...structuredClone(transform) };
    }
    return transformed;
}

export function selectStartupLayout(savedLayout, canonicalLayout, {
    allowSavedLayout = false, deploymentLayout = canonicalLayout
} = {}) {
    const savedBelongsToCanonical = savedLayout?.canonicalBaseline === CANONICAL_LAYOUT_ID &&
        savedLayout?.revision === canonicalLayout?.revision;
    return allowSavedLayout && savedBelongsToCanonical
        ? applyAuthorizedTransforms(savedLayout)
        : deploymentLayout;
}

async function fetchVerifiedLayout(url, expectedHash, label) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`โหลด ${label} ไม่สำเร็จ (${response.status})`);
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== expectedHash) throw new Error(`${label} checksum ไม่ตรง (${hash})`);
    return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Make the locked map the explicit cross-origin startup baseline. Old per-origin
 * localStorage remains untouched, but is ignored because it has no canonical marker.
 */
export async function loadCanonicalLayout({ allowSavedLayout = !window.TDK_VIEWER_ONLY } = {}) {
    const [canonicalLayout, deploymentLayout] = await Promise.all([
        fetchVerifiedLayout('./snapshots/baseline-2026-11-05/layout.json',
            CANONICAL_LAYOUT_SHA256, 'canonical map'),
        fetchVerifiedLayout('./deployments/viewer-layout-2026-11-17.json',
            DEPLOYMENT_LAYOUT_SHA256, 'deployment map')
    ]);
    if (canonicalLayout?.revision !== 12 || Object.keys(canonicalLayout?.objects || {}).length !== 671) {
        throw new Error('Canonical map ไม่ผ่านการตรวจ revision/object count');
    }
    if (deploymentLayout?.deploymentLayout !== DEPLOYMENT_LAYOUT_ID ||
        deploymentLayout?.canonicalBaseline !== CANONICAL_LAYOUT_ID) {
        throw new Error('Deployment map ไม่ได้อ้างอิง canonical baseline ที่ล็อกไว้');
    }
    const deploymentAudit = auditLayoutAgainstBaseline(deploymentLayout, canonicalLayout);
    if (!deploymentAudit.ok) {
        throw new Error(`Deployment map เปลี่ยนวัตถุเดิม ${deploymentAudit.differences.slice(0, 4).join(', ')}`);
    }

    let savedLayout = null;
    try { savedLayout = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || 'null'); }
    catch (_) { /* Invalid or unavailable storage falls back to the locked snapshot. */ }

    window.TDK_CANONICAL_LAYOUT_ID = CANONICAL_LAYOUT_ID;
    window.TDK_CANONICAL_LAYOUT_SHA256 = CANONICAL_LAYOUT_SHA256;
    window.TDK_DEPLOYMENT_LAYOUT_ID = DEPLOYMENT_LAYOUT_ID;
    window.TDK_DEPLOYMENT_LAYOUT_SHA256 = DEPLOYMENT_LAYOUT_SHA256;
    const usesSavedLayout = allowSavedLayout &&
        savedLayout?.canonicalBaseline === CANONICAL_LAYOUT_ID &&
        savedLayout?.revision === canonicalLayout?.revision;
    window.TDK_FACTORY_LAYOUT_OVERRIDE = selectStartupLayout(savedLayout, canonicalLayout, {
        allowSavedLayout, deploymentLayout
    });
    window.TDK_FACTORY_LAYOUT_SOURCE = usesSavedLayout
        ? 'canonical-local-edit'
        : 'deployment-layout';
    return window.TDK_FACTORY_LAYOUT_OVERRIDE;
}

