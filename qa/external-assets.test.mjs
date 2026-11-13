import assert from 'node:assert/strict';
import {
    EXTERNAL_ASSET_PRESETS,
    externalAssetPreset,
    normalizeExternalAsset
} from '../src/external-assets.js';

assert.equal(EXTERNAL_ASSET_PRESETS.length, 3);
for (const asset of EXTERNAL_ASSET_PRESETS) {
    assert.match(asset.url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/KhronosGroup\/glTF-Sample-Assets@[0-9a-f]{40}\//);
    assert.equal(new URL(asset.url).protocol, 'https:');
    assert.ok(asset.credit && asset.license && asset.targetSize > 0);
    assert.equal(externalAssetPreset(asset.id), asset);
}

const normalized = normalizeExternalAsset({
    kind: 'model',
    url: './assets/car.glb',
    name: '  รถทดสอบ  ',
    targetSize: 999,
    credit: 'Example author',
    license: 'CC0-1.0'
}, 'https://maps.example.test/editor/');
assert.equal(normalized.url, 'https://maps.example.test/editor/assets/car.glb');
assert.equal(normalized.name, 'รถทดสอบ');
assert.equal(normalized.targetSize, 50);
assert.equal(normalized.credit, 'Example author');
assert.equal(normalized.license, 'CC0-1.0');

assert.throws(() => normalizeExternalAsset({ kind: 'archive', url: 'https://example.test/a.zip' }), /ชนิดไฟล์/);
assert.throws(() => normalizeExternalAsset({ kind: 'image', url: 'file:///tmp/sign.png' }), /http/);

console.log('PASS: pinned external CDN catalog and URL metadata validation');
