export const CANONICAL_LAYOUT_ID = 'baseline-2026-11-05:263c223a07fdfa1c88ba80aed1d1e3c3dbbe9f181a1e5a89c9a8526c535fd004';
export const EDITOR_STORAGE_KEY = 'tdk-v7-object-layout-v1';

export function selectStartupLayout(savedLayout, canonicalLayout) {
    const savedBelongsToCanonical = savedLayout?.canonicalBaseline === CANONICAL_LAYOUT_ID &&
        savedLayout?.revision === canonicalLayout?.revision;
    return savedBelongsToCanonical ? savedLayout : canonicalLayout;
}

/**
 * Make the locked map the explicit cross-origin startup baseline. Old per-origin
 * localStorage remains untouched, but is ignored because it has no canonical marker.
 */
export async function loadCanonicalLayout() {
    const response = await fetch('./snapshots/baseline-2026-11-05/layout.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`โหลด canonical map ไม่สำเร็จ (${response.status})`);
    const canonicalLayout = await response.json();
    if (canonicalLayout?.revision !== 12 || Object.keys(canonicalLayout?.objects || {}).length !== 671) {
        throw new Error('Canonical map ไม่ผ่านการตรวจ revision/object count');
    }

    let savedLayout = null;
    try { savedLayout = JSON.parse(localStorage.getItem(EDITOR_STORAGE_KEY) || 'null'); }
    catch (_) { /* Invalid or unavailable storage falls back to the locked snapshot. */ }

    window.TDK_CANONICAL_LAYOUT_ID = CANONICAL_LAYOUT_ID;
    window.TDK_FACTORY_LAYOUT_OVERRIDE = selectStartupLayout(savedLayout, canonicalLayout);
    window.TDK_FACTORY_LAYOUT_SOURCE = window.TDK_FACTORY_LAYOUT_OVERRIDE === savedLayout
        ? 'canonical-local-edit'
        : 'canonical-snapshot';
    return window.TDK_FACTORY_LAYOUT_OVERRIDE;
}

