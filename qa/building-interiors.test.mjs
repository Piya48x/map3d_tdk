import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { BUILDINGS } from '../src/factory-data.js';
import {
    BUILDING_INTERIORS, EXECUTIVE_TOUR_STOPS, createBuildingInterior
} from '../src/building-interiors.js';

const source = readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url));
assert.equal(createHash('sha256').update(source).digest('hex'),
    '263c223a07fdfa1c88ba80aed1d1e3c3dbbe9f181a1e5a89c9a8526c535fd004');
assert.deepEqual(Object.keys(BUILDING_INTERIORS).sort(), BUILDINGS.map(item => item.id).sort());
assert.deepEqual(BUILDING_INTERIORS.main_office.zones.map(zone => zone.id), [
    'main-office', 'md-room', 'meeting-1', 'meeting-2', 'restrooms'
]);
assert.deepEqual(BUILDING_INTERIORS.canteen.zones.map(zone => zone.name), [
    'DIE-SET Area', 'Office PD Team', 'Spare Room', 'QC Area', 'Maintenance', 'ห้องน้ำ'
]);
assert.deepEqual(BUILDING_INTERIORS.doke1_west.zones.map(zone => zone.name), [
    'Tap-Line', 'Spot-Line', 'A-J Line', 'MDB', 'AIR', 'QC Area', 'ห้องน้ำ'
]);
assert.deepEqual(BUILDING_INTERIORS.doke1_store.zones.map(zone => zone.name), [
    'Store', 'Office (Store)', 'Assy Rear frame', 'Coating 1', 'Powder', 'Shower', 'ห้องน้ำ'
]);
assert.deepEqual(BUILDING_INTERIORS.doke2_assy.zones.map(zone => zone.name), [
    'K-Line', 'Coating 2', 'Banding Machine', 'MDB', 'AIR', 'ห้องน้ำ'
]);
assert.deepEqual(BUILDING_INTERIORS.rack_dome.zones.map(zone => zone.name), [
    'พื้นที่จัดเก็บแร็ค', 'จุดรับ-จ่ายแร็ค', 'ทางเดินขนย้าย', 'พื้นที่แร็คสำรอง', 'AIR'
]);
assert.equal(BUILDING_INTERIORS.rack_dome.title, 'โดมเก็บแร็ค');
assert.equal(EXECUTIVE_TOUR_STOPS.length, 6);
assert.deepEqual(EXECUTIVE_TOUR_STOPS.map(stop => stop.buildingId), [
    'main_office', 'canteen', 'doke1_west', 'doke1_store', 'doke2_assy', 'rack_dome'
]);
assert.equal(EXECUTIVE_TOUR_STOPS.at(-1).title, 'โดมเก็บแร็ค');

globalThis.document = {
    createElement(type) {
        assert.equal(type, 'canvas');
        return { width: 0, height: 0, getContext: () => ({
            clearRect() {}, fillText() {}, set fillStyle(_) {}, set textAlign(_) {},
            set textBaseline(_) {}, set font(_) {}
        }) };
    }
};

for (const building of BUILDINGS) {
    const data = BUILDING_INTERIORS[building.id];
    assert.ok(data.zones.length >= 3, `${building.id} needs meaningful separate areas`);
    const ids = new Set();
    for (const zone of data.zones) {
        assert.ok(!ids.has(zone.id), `${building.id} has duplicate zone ID ${zone.id}`);
        ids.add(zone.id);
        const [u, v, w, d] = zone.rect;
        assert.ok(u >= 0 && v >= 0 && w > 0 && d > 0 && u + w <= 1 && v + d <= 1,
            `${building.id}/${zone.id} must fit within its building`);
        assert.ok(zone.name && zone.detail);
    }
    for (let i = 0; i < data.zones.length; i++) {
        for (let j = i + 1; j < data.zones.length; j++) {
            const [ax, az, aw, ad] = data.zones[i].rect;
            const [bx, bz, bw, bd] = data.zones[j].rect;
            const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
            const overlapZ = Math.min(az + ad, bz + bd) - Math.max(az, bz);
            assert.ok(overlapX <= 0 || overlapZ <= 0,
                `${building.id} overlaps ${data.zones[i].id} and ${data.zones[j].id}`);
        }
    }
    const model = createBuildingInterior(THREE, building, 1.54);
    assert.equal(model.pickables.length, data.zones.length);
    assert.ok(model.root.children.length > data.zones.length);
    for (const item of model.pickables) assert.ok(ids.has(item.userData.interiorZone));
    model.setSelected(data.zones[0].id);
    model.dispose();
}

console.log('PASS: six executive-tour interiors match the requested areas, fit footprints, and create pickable models');
