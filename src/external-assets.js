const KHRONOS_ASSET_COMMIT = '8f492390ddc7a2ae221a1369ef560589cf8c70fb';
const KHRONOS_CDN_ROOT = `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@${KHRONOS_ASSET_COMMIT}/Models`;

export const EXTERNAL_ASSET_PRESETS = Object.freeze([
    Object.freeze({
        id: 'khronos-toy-car',
        name: 'รถยนต์ Toy Car · CDN',
        kind: 'model',
        url: `${KHRONOS_CDN_ROOT}/ToyCar/glTF-Binary/ToyCar.glb`,
        targetSize: 5.2,
        credit: 'Guido Odendahl, Eric Chadwick · Khronos glTF Sample Assets',
        license: 'CC0-1.0'
    }),
    Object.freeze({
        id: 'khronos-milk-truck',
        name: 'รถบรรทุก Cesium Milk Truck · CDN',
        kind: 'model',
        url: `${KHRONOS_CDN_ROOT}/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb`,
        targetSize: 7,
        credit: 'Cesium · Khronos glTF Sample Assets',
        license: 'CC-BY-4.0'
    }),
    Object.freeze({
        id: 'khronos-lantern',
        name: 'โคมไฟถนน Lantern · CDN',
        kind: 'model',
        url: `${KHRONOS_CDN_ROOT}/Lantern/glTF-Binary/Lantern.glb`,
        targetSize: 4.5,
        credit: 'Microsoft, sbtron, Frank Galligan · Khronos glTF Sample Assets',
        license: 'CC0-1.0'
    })
]);

export function externalAssetPreset(id) {
    return EXTERNAL_ASSET_PRESETS.find(asset => asset.id === id) || null;
}

export function normalizeExternalAsset(asset, baseUrl = globalThis.location?.href) {
    if (!asset || !['model', 'image'].includes(asset.kind)) {
        throw new Error('ชนิดไฟล์ต้องเป็นโมเดล GLB/GLTF หรือรูปภาพ');
    }
    let url;
    try { url = new URL(String(asset.url || '').trim(), baseUrl); }
    catch (_) { throw new Error('URL ของวัตถุไม่ถูกต้อง'); }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('URL ต้องเริ่มด้วย http:// หรือ https://');
    }
    const targetSize = Number(asset.targetSize);
    return {
        kind: asset.kind,
        url: url.href,
        name: String(asset.name || (asset.kind === 'model' ? 'โมเดลภายนอก' : 'รูปภาพภายนอก')).trim().slice(0, 100),
        targetSize: Number.isFinite(targetSize) ? Math.min(50, Math.max(.25, targetSize)) : 5,
        ...(asset.presetId ? { presetId: String(asset.presetId) } : {}),
        ...(asset.credit ? { credit: String(asset.credit).slice(0, 300) } : {}),
        ...(asset.license ? { license: String(asset.license).slice(0, 80) } : {})
    };
}
