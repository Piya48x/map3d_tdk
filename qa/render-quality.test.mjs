import assert from 'node:assert/strict';
import { createAdaptiveRenderQuality } from '../src/render-quality.js';

const changes = [];
const quality = createAdaptiveRenderQuality({
    devicePixelRatio: 3, width: 1920, height: 1080, compact: false,
    onChange: value => changes.push(value)
});
assert.equal(quality.pixelRatio, 1.4);
assert.ok(quality.maximumPixelRatio < 1.5, 'Large viewports need a pixel budget');

for (let frame = 0; frame < 130; frame++) quality.sample(1 / 30);
assert.ok(quality.pixelRatio < 1.4, 'Sustained slow frames should lower render resolution');
const lowered = quality.pixelRatio;
for (let frame = 0; frame < 390; frame++) quality.sample(1 / 60);
assert.ok(quality.pixelRatio > lowered, 'Sustained fast frames should restore sharpness');

quality.resize(3840, 2160, false);
assert.equal(quality.pixelRatio, 1, 'A 4K viewport should stay within the pixel budget');
const beforePause = changes.length;
quality.sample(2);
assert.equal(changes.length, beforePause, 'Background tab pauses must not change quality');

console.log('PASS: adaptive render resolution responds to sustained frame rate and viewport size');
