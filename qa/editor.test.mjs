import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as RealThree from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { auditLayoutAgainstBaseline as auditExportLayout } from '../src/threejs-export.js';
import { positionOnActivityLoop } from '../src/activity-navigation.js';

// Integration harness: real geometry and controls, DOM events and storage;
// only canvas rasterization and the GPU renderer are stubbed. This is not visual QA.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../src/app-config.js', import.meta.url), 'utf8').replaceAll('export ', '');
const movement = readFileSync(new URL('../src/game-controls.js', import.meta.url), 'utf8').replaceAll('export ', '');
const threejsExport = readFileSync(new URL('../src/threejs-export.js', import.meta.url), 'utf8').replaceAll('export ', '');
const moduleSource = [
    threejsExport,
    readFileSync(new URL('../src/activity-navigation.js', import.meta.url), 'utf8').replaceAll('export ', ''),
    readFileSync(new URL('../src/render-quality.js', import.meta.url), 'utf8').replaceAll('export ', ''),
    readFileSync(new URL('../src/building-interiors.js', import.meta.url), 'utf8').replaceAll('export ', ''),
    readFileSync(new URL('../src/external-assets.js', import.meta.url), 'utf8').replaceAll('export ', ''),
    readFileSync(new URL('../src/presentation/presentation-config.js', import.meta.url), 'utf8').replaceAll('export ', ''),
    readFileSync(new URL('../src/factory-data.js', import.meta.url), 'utf8')
        .replace(/^\s*import .*;$/gm, '')
        .replace(/^([ \t]*)export /gm, '$1'),
    readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
        .replace(/^[ \t]*import\b[\s\S]*?from[ \t]+['"][^'"]+['"];[ \t]*\r?$/gm, '')
].join('\n');
const errors = [];
function boot(saved, savedCamera, view = '', viewerOnly = false, openEditor = false) {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (openEditor) params.set('editor', '1');
    const suffix = params.size ? `?${params}` : '';
    const dom = new JSDOM(html, { url: `http://127.0.0.1:5500/v7/index.html${suffix}`, runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    win.TDK_VIEWER_ONLY = viewerOnly;
    const context = dom.getInternalVMContext();
    win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (_, key) =>
        key === 'measureText' ? text => ({ width: text.length * 12 }) : () => {} });
    class Renderer {
        constructor() { this.domElement = win.document.createElement('canvas'); this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 1 }; }
        setSize() {} setPixelRatio(value) { this.pixelRatio = value; } setAnimationLoop(fn) { this.frame = fn; } render() {}
    }
    win.THREE = { ...RealThree, WebGLRenderer: Renderer };
    win.structuredClone = structuredClone;
    win.OrbitControls = OrbitControls;
    win.TransformControls = TransformControls;
    win.GLTFLoader = class {
        load(_url, onLoad) {
            const scene = new RealThree.Group();
            scene.add(new RealThree.Mesh(
                new RealThree.BoxGeometry(2, 1, 4),
                new RealThree.MeshStandardMaterial({ color: '#2470b8' })
            ));
            queueMicrotask(() => onLoad({ scene }));
        }
    };
    win.console.error = (...args) => errors.push(args.map(String).join(' '));
    win.console.warn = (...args) => { if (!String(args[0]).includes('Multiple instances')) errors.push(args.map(String).join(' ')); };
    if (saved) win.localStorage.setItem('tdk-v7-object-layout-v1', saved);
    if (savedCamera) win.localStorage.setItem('tdk-v7-aerial-reference-camera', savedCamera);
    const exposed = `window.testAPI = { scene, renderer, controls, transformControls, setEditorMode, selectEditable,
        captureEditableTransforms, setEditorTransformMode, createEditorObject, deleteSelectedEditable,
        duplicateSelectedEditable, undoEditorChange, redoEditorChange, saveEditorLayout,
        cutSelectedWall,
        setGameMode, updatePlayer, playerBlocked, playerKeys, updateEditableBounds,
        get selected() { return [...selectedEditables]; }, get selectedPivot() { return selectionPivot; },
        get mode() { return editorMode; }, get camera() { return camera; },
        get materials() { return M; },
        get skylightMaterial() { return M.skylight; },
        get buildingNightLights() { return buildingNightLights; },
        get siteNightLights() { return siteNightLights; },
        get sun() { return sun; }, get moon() { return moon; },
        get renderQuality() { return renderQuality; },
        get lampEmitterMaterial() { return lampEmitterMaterial; },
        get player() { return player; }, get gameMode() { return gameMode; },
        get activityActors() { return [...workers, ...movingForklifts, ...movingVehicles]; },
        get activityObstacles() { return activityObstacles; },
        updateActivity, updatePresentationEnvironmentTransition, updatePresentationShow,
        get environmentTransitionStartedAt() { return presentationShowState.environmentTransition?.startedAt ?? 0; },
        get presentationStartedAt() { return presentationShowState.startedAt; },
        get presentationTourStops() { return EXECUTIVE_TOUR_STOPS; },
        get presentationStopPoses() { return presentationStopPoses; },
        get presentationBuildingGroups() { return presentationBuildingGroups; },
        get objects() { return editableObjects; } };`;
    vm.runInContext(config + movement + moduleSource.replace("            loading.style.opacity = '0';", exposed + "\n            loading.style.opacity = '0';"), context);
    assert.deepEqual(errors, [], 'Scene should initialize without runtime errors');
    assert.ok(win.testAPI, 'Editor initialized');
    return { dom, win, api: win.testAPI, doc: win.document };
}
function click(env, id) { env.doc.getElementById(id).click(); }
function change(env, id, value) {
    const input = env.doc.getElementById(id);
    input.value = String(value);
    input.dispatchEvent(new env.win.Event('change', { bubbles: true }));
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`); }
const env = boot();
const { api, doc, win } = env;
api.renderer.frame();
const objectCountBeforeInteriors = api.objects.size;
const layoutBeforeInteriors = win.localStorage.getItem('tdk-v7-object-layout-v1');
for (const id of ['main_office', 'doke1_west', 'doke1_store', 'doke2_assy', 'rack_dome', 'canteen']) {
    const exterior = api.objects.get(`building-${id}`);
    assert.equal(win.TDK_FACTORY_MAP.openInterior(id), true, `${id} should open`);
    assert.equal(win.TDK_FACTORY_MAP.activeInterior, id);
    assert.equal(exterior.visible, false, `${id} exterior should be hidden for cutaway`);
    assert.equal(doc.getElementById('interior-panel').hidden, false);
    assert.ok(doc.querySelectorAll('#interior-zones button').length >= 3);
    if (id === 'main_office') assert.equal(doc.querySelectorAll('#interior-zones button').length, 5);
    assert.ok(api.scene.getObjectByName(`Interior presentation · ${id}`));
    doc.querySelectorAll('#interior-zones button')[1].click();
    assert.equal(doc.querySelectorAll('#interior-zones button.active').length, 1);
    click(env, 'interior-back');
    assert.equal(win.TDK_FACTORY_MAP.activeInterior, null);
    assert.equal(exterior.visible, true, `${id} exterior should return`);
    assert.equal(doc.getElementById('interior-panel').hidden, true);
    assert.equal(api.scene.getObjectByName(`Interior presentation · ${id}`), undefined);
}
assert.equal(api.objects.size, objectCountBeforeInteriors, 'Presentation rooms must not become editor objects');
assert.equal(win.localStorage.getItem('tdk-v7-object-layout-v1'), layoutBeforeInteriors,
    'Opening interiors must not change the saved map');
assert.equal(win.TDK_LAYOUT.layoutWarnings.length, 0, 'Building footprints must not overlap');
const securityBooth = api.objects.get('security-booth');
const cardAccess = api.objects.get('security-card-access');
const entranceMonument = api.objects.get('entrance-tdk-monument-v1');
const entranceAvenue = api.objects.get('entrance-landscaped-avenue-v1');
assert.ok(securityBooth && cardAccess, 'Security booth and card access should be separate editable objects');
assert.ok(entranceMonument, 'Reference-inspired TDK entrance monument should use a stable additive ID');
assert.ok(entranceAvenue, 'Landscaped entrance avenue should use a separate stable additive ID');
assert.ok(entranceMonument.position.z > 78 && entranceMonument.position.x > -6,
    'Entrance monument should stand outside the right side of the vehicle gate');
assert.ok(entranceMonument.getObjectByName('Entrance monument panel')?.isMesh &&
    entranceMonument.getObjectByName('Entrance monument TDK 3D logo')?.isGroup &&
    entranceMonument.getObjectByName('Entrance monument planting bed')?.isMesh,
    'Entrance monument should include the tall panel, raised 3D TDK branding, and landscaped island');
assert.ok(entranceAvenue.getObjectByName('Entrance avenue red curbs')?.isInstancedMesh &&
    entranceAvenue.getObjectByName('Entrance avenue hedges')?.isInstancedMesh &&
    entranceAvenue.getObjectByName('Entrance avenue tree crowns')?.isInstancedMesh,
    'Entrance avenue should include efficient instanced curbs, hedges, and trees');
assert.equal(cardAccess.parent, api.scene, 'Card access should not be parented to the security booth');
assert.ok(Math.abs(cardAccess.position.x - securityBooth.position.x) < 1e-6 &&
    cardAccess.position.z > securityBooth.position.z,
    'Card access should remain positioned in front of the booth');
const boothRoofEave = securityBooth.getObjectByName('Roof eave');
assert.ok(boothRoofEave?.isMesh && boothRoofEave.scale.x > 5 && boothRoofEave.scale.z > 4.5,
    'Security booth roof should project beyond the booth footprint');
const forestPath = [...api.objects.values()].find(group =>
    group.userData.editor.label === 'Main Office forest path');
const forestPlanting = [...api.objects.values()].find(group =>
    group.userData.editor.label === 'Main Office forest planting');
const forestTrees = [...api.objects.values()].filter(group =>
    group.userData.editor.label === 'ต้นไม้แนวทางหลังสำนักงาน');
assert.ok(forestPath && forestPlanting, 'Main Office should have a dedicated forest path and green planting beds');
assert.equal(forestTrees.length, 12, 'Forest path should have two rows of six trees');
assert.ok(Math.abs(forestPath.position.z - api.objects.get('building-main_office').position.z) < 1e-6,
    'Forest path should run alongside the Main Office');
assert.match(doc.getElementById('editor-cut').textContent, /✂️/,
    'Partial cut action should show a scissors icon');
const buildings = Object.fromEntries(win.TDK_LAYOUT.BUILDINGS.map(building => [building.id, building]));
near(api.camera.position.x, 151); near(api.camera.position.y, 142); near(api.camera.position.z, 169);
near(api.camera.fov, 43); near(api.controls.target.x, 32); near(api.controls.target.y, 0); near(api.controls.target.z, 31);
assert.equal(doc.querySelector('.view[data-view="aerial"]').classList.contains('active'), true,
    'Aerial view should be selected on initial page load');
const aerialPreset = win.TDK_LAYOUT.CAMERA_PRESETS.aerial;
assert.deepEqual(Array.from(aerialPreset.position), [151, 142, 169]);
assert.deepEqual(Array.from(aerialPreset.target), [32, 0, 31]);
assert.equal(aerialPreset.fov, 43, 'Aerial view should balance the full edited campus around one visual centre');
assert.equal(api.buildingNightLights.length, win.TDK_LAYOUT.BUILDINGS.length * 2,
    'Every building should have two night lights');
assert.equal(api.scene.getObjectByName('Factory streetlights').children.filter(object => object.isLight).length,
    api.siteNightLights.length, 'Every streetlight should have a working point light');
assert.equal(api.sun.shadow.mapSize.x, 2048);
assert.equal(api.renderer.shadowMap.autoUpdate, false);
assert.equal(api.renderer.shadowMap.needsUpdate, true);
assert.equal(api.sun.castShadow, true);
assert.equal(api.moon.castShadow, false);
assert.ok(api.siteNightLights.every(light => !light.visible));
doc.querySelector('[data-environment="night"]').click();
assert.equal(api.sun.castShadow, false);
assert.equal(api.moon.castShadow, true);
assert.ok(api.siteNightLights.every(light => light.visible));
assert.ok(api.buildingNightLights.every(light => light.intensity === 28),
    'Night mode should brightly illuminate every building');
assert.ok(api.siteNightLights.every(light => light.intensity === 24),
    'Night mode should brightly illuminate every streetlight');
assert.equal(api.lampEmitterMaterial.emissiveIntensity, 3.2,
    'Building and streetlight fixtures should glow at night');
doc.querySelector('[data-environment="day"]').click();
assert.equal(api.sun.castShadow, true);
assert.equal(api.moon.castShadow, false);
assert.ok(api.siteNightLights.every(light => !light.visible));
assert.ok(api.buildingNightLights.every(light => light.intensity === 0) &&
    api.siteNightLights.every(light => light.intensity === 0),
    'Building and streetlights should switch off in day mode');
const doke2 = api.objects.get('building-doke2_assy');
const doke2EntranceSign = doke2.getObjectByName('Doke 2 entrance TDK sign');
assert.ok(doke2EntranceSign?.isMesh && doke2EntranceSign.position.y < 4,
    'Doke 2 entrance should display a freestanding TDK sign');
assert.ok(doke2.getObjectByName('Doke 2 entrance TDK sign support left')?.isMesh &&
    doke2.getObjectByName('Doke 2 entrance TDK sign support right')?.isMesh,
    'TDK entrance sign should have two freestanding supports');
assert.deepEqual(
    ['doke1_west', 'doke1_store', 'doke2_assy', 'rack_dome', 'main_office', 'canteen']
        .map(id => [buildings[id].position.x, buildings[id].position.z]),
    [[-32, -28], [-4, -15.5], [31, -10.5], [19.5, 31], [-16.5, 30], [-38.5, 6.5]],
    'Building placement should match the adjusted campus layout'
);
assert.equal(buildings.rack_dome.size.depth, 25);
assert.deepEqual(Array.from(win.TDK_LAYOUT.WALKWAYS, ({ width }) => width), [1.8],
    'Office access marking should retain its mapped width');
assert.deepEqual(
    Array.from(win.TDK_LAYOUT.WALKWAYS[0].points, point => Array.from(point)),
    [[-13.6, 51.3], [-13.6, 25.8], [-17.7, 25.8]],
    'Office access marking should turn left toward the Main Office'
);
assert.equal(
    JSON.stringify(win.TDK_LAYOUT.PARKING_AREAS.map(({ id, x, z, width, depth, spaces }) =>
        [id, x, z, width, depth, spaces])),
    JSON.stringify([
        ['front-carpark-rear', -32, 52.2, 27, 4, 9],
        ['front-carpark-front', -32, 56.6, 27, 4, 9]
    ]),
    'Carports should be positioned beside the entrance, not alongside the Main Office'
);
for (const parking of win.TDK_LAYOUT.PARKING_AREAS) {
    for (const building of win.TDK_LAYOUT.BUILDINGS) {
        const rotation = building.rotationY || 0;
        const buildingWidth = Math.abs(building.size.width * Math.cos(rotation)) +
            Math.abs(building.size.depth * Math.sin(rotation));
        const buildingDepth = Math.abs(building.size.width * Math.sin(rotation)) +
            Math.abs(building.size.depth * Math.cos(rotation));
        const overlapX = Math.min(parking.x + parking.width / 2, building.position.x + buildingWidth / 2) -
            Math.max(parking.x - parking.width / 2, building.position.x - buildingWidth / 2);
        const overlapZ = Math.min(parking.z + parking.depth / 2, building.position.z + buildingDepth / 2) -
            Math.max(parking.z - parking.depth / 2, building.position.z - buildingDepth / 2);
        assert.ok(overlapX <= 0 || overlapZ <= 0,
            `${parking.id} should not overlap ${building.id}`);
    }
    const guardBounds = { minX: -36, maxX: -31, minZ: 68.25, maxZ: 72.75 };
    const overlapsGuard = parking.x - parking.width / 2 < guardBounds.maxX &&
        parking.x + parking.width / 2 > guardBounds.minX &&
        parking.z - parking.depth / 2 < guardBounds.maxZ &&
        parking.z + parking.depth / 2 > guardBounds.minZ;
    assert.equal(overlapsGuard, false, `${parking.id} should not block the security booth`);
}
let rackSkylightBands = 0;
api.objects.get('building-rack_dome').traverse(object => {
    if (object.isMesh && object.material === api.skylightMaterial) rackSkylightBands += 1;
});
assert.equal(rackSkylightBands, 5, 'Rack Dome roof should match the five narrow translucent bands in the aerial reference');
const canteen = api.objects.get('building-canteen');
let canteenWhiteFacadePieces = 0;
canteen.traverse(object => {
    if (object.isMesh && object.material === api.materials.officeWhite) canteenWhiteFacadePieces += 1;
});
assert.ok(canteenWhiteFacadePieces > 20, 'Canteen should retain a layered white facade');
assert.ok(api.objects.get('building-doke1_west').getObjectByName('TDK company sign'),
    'Doke 1 should display the TDK company sign on its front facade');
assert.ok(doke2.getObjectByName('TDK company sign'),
    'Doke 2 should display the TDK company sign on its front facade');
const doke2Sign = doke2.getObjectByName('TDK company sign');
const doke2Eave = buildings.doke2_assy.size.height * 1.54 + .45;
const doke2RoofRise = buildings.doke2_assy.roof.rise * 1.54;
const doke2RoofWidth = buildings.doke2_assy.size.width * 1.54 + 1.8;
const doke2RoofAtSignEdge = doke2Eave + doke2RoofRise *
    (1 - (doke2Sign.geometry.parameters.width / doke2RoofWidth) ** 2);
assert.ok(doke2Sign.position.y - doke2Sign.geometry.parameters.height / 2 > doke2Eave,
    'Doke 2 company sign should sit above the eave on the blue gable');
assert.ok(doke2Sign.position.y + doke2Sign.geometry.parameters.height / 2 < doke2RoofAtSignEdge,
    'Doke 2 company sign should fit under the curved roof at both ends');
assert.ok(doke2Sign.position.z > buildings.doke2_assy.size.depth * 1.54 / 2 + .8,
    'Doke 2 company sign should be visible in front of the gable');
const storeBuilding = api.objects.get('building-doke1_store');
const storeSign = storeBuilding.getObjectByName('TDK company sign');
assert.ok(storeSign, 'Store should display a TDK company sign');
assert.ok(storeSign.geometry.parameters.width / storeSign.geometry.parameters.height > 5,
    'Store company sign should retain a wide, readable signboard shape');
const storeEave = buildings.doke1_store.size.height * 1.54 + .45;
const storeRoofRise = buildings.doke1_store.roof.rise * 1.54;
const storeRoofWidth = buildings.doke1_store.size.width * 1.54 + 1.8;
const storeRoofAtSignEdge = storeEave + storeRoofRise *
    (1 - (storeSign.geometry.parameters.width / storeRoofWidth) ** 2);
assert.ok(storeSign.position.y - storeSign.geometry.parameters.height / 2 > storeEave,
    'Store sign should sit above the eave on the blue gable');
assert.ok(storeSign.position.y + storeSign.geometry.parameters.height / 2 < storeRoofAtSignEdge,
    'Store sign should fit under the curved roof at both ends');
assert.ok(storeSign.position.z > buildings.doke1_store.size.depth * 1.54 / 2 + .8,
    'Store sign should be visible in front of the gable');
let doke2DarkFacadeDetails = 0;
doke2.traverse(object => {
    if (object.isMesh && object.material === api.materials.dark) doke2DarkFacadeDetails += 1;
});
assert.ok(doke2DarkFacadeDetails >= 3, 'Doke 2 should have dark lower facade openings');
let doke1LightRoofPieces = 0;
api.objects.get('building-doke1_west').traverse(object => {
    if (object.isMesh && object.material === api.materials.roofLightBlue) doke1LightRoofPieces += 1;
});
assert.ok(doke1LightRoofPieces > 0, 'Doke 1 roof should use a light blue material');
assert.ok(api.materials.roofLightBlue.color.b > api.materials.roofLightBlue.color.g &&
    api.materials.roofLightBlue.color.g > api.materials.roofLightBlue.color.r,
    'Doke 1 roof material should be visibly blue');
assert.ok(api.objects.get('building-doke2_assy').children.some(object =>
    object.isMesh && object.material === api.materials.roof
), 'Doke 2 roof should also use the blue roof material');
assert.ok(api.materials.roof.color.b > api.materials.roof.color.g &&
    api.materials.roof.color.g > api.materials.roof.color.r,
    'Main factory roof material should be visibly blue');
const officeCanopy = api.objects.get('building-main_office').getObjectByName('Main Office entrance canopy');
assert.ok(officeCanopy, 'Main Office should have a distinct entrance canopy');
const canopyRoof = officeCanopy.children.find(object => object.isMesh && object.geometry.type === 'BufferGeometry');
canopyRoof.geometry.computeBoundingBox();
assert.ok(canopyRoof.geometry.boundingBox.max.x - canopyRoof.geometry.boundingBox.min.x > 13);
assert.ok(canopyRoof.geometry.boundingBox.max.z - canopyRoof.geometry.boundingBox.min.z > 8);
assert.ok(!api.scene.children.some(object =>
    object.isMesh && object.geometry.type === 'SphereGeometry' && object.scale.x > 100
), 'Distant horizon should not have a prominent hill mesh');
assert.equal(api.objects.has('building-main_office'), true);
const correctedWestHall = boot(JSON.stringify({
    revision: 11,
    objects: {
        'building-doke1_west': {
            position: { x: -40, y: 0, z: -35 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1.5, y: 1, z: 1.4 },
            label: 'Oversized Doke 1'
        }
    },
    added: []
}));
const westHall = correctedWestHall.api.objects.get('building-doke1_west');
near(westHall.position.x, -32 * correctedWestHall.win.TDK_LAYOUT.SITE.renderUnitsPerSiteUnit);
near(westHall.position.z, -28 * correctedWestHall.win.TDK_LAYOUT.SITE.renderUnitsPerSiteUnit);
near(westHall.scale.x, 1); near(westHall.scale.y, 1); near(westHall.scale.z, 1);
assert.ok(correctedWestHall.win.localStorage.getItem('tdk-v7-object-layout-v1-backup-r11'),
    'Previous layout should be backed up when resetting the oversized built-in hall');
const spawnObstacle = api.objects.get('building-main_office');
const spawnObstaclePosition = spawnObstacle.position.clone();
spawnObstacle.position.set(0, 0, 0);
api.updateEditableBounds(spawnObstacle);
assert.equal(api.playerBlocked(0, 0), true, 'Fixture must block the configured spawn point');
api.setGameMode(true);
const blockingAtGameStart = [...api.objects.values()].filter(group => {
    if (!group.userData.editor?.collidable) return false;
    const box = group.userData.editorBounds;
    const { x, z } = api.player.position;
    return box && x + .72 > box.min.x && x - .72 < box.max.x && z + .72 > box.min.z && z - .72 < box.max.z;
}).map(group => `${group.userData.editor.id}:${group.userData.editor.label}`);
assert.equal(api.playerBlocked(api.player.position.x, api.player.position.z), false,
    `Game mode must relocate a blocked spawn to walkable ground; blockers=${blockingAtGameStart.join(',')}`);
const gameStart = api.player.position.clone();
win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
api.updatePlayer(.1);
assert.notDeepEqual([api.player.position.x, api.player.position.z], [gameStart.x, gameStart.z],
    'W must move the player horizontally in game mode');
win.dispatchEvent(new win.KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
api.setGameMode(false);
spawnObstacle.position.copy(spawnObstaclePosition);
api.updateEditableBounds(spawnObstacle);
click(env, 'editor-toggle');
const fence = [...api.objects.values()].find(group => group.userData.editor.label === 'Perimeter fence 1');
assert.ok(fence?.userData.editor.cuttable, 'Perimeter walls should support the scissors cut tool');
const fenceId = fence.userData.editor.id;
api.selectEditable(fence);
assert.equal(doc.getElementById('editor-cut').disabled, false);
click(env, 'editor-cut');
assert.equal(doc.getElementById('editor-cut').classList.contains('active'), true,
    'Scissors button should activate partial-cut mode');
api.cutSelectedWall(-8, 8);
assert.equal(api.objects.has(fenceId), false,
    `Cutting should replace the original wall with separate sections; status=${doc.getElementById('editor-status').textContent}`);
const cutLeft = api.objects.get('wall-cut-1-left');
const cutRight = api.objects.get('wall-cut-1-right');
assert.ok(cutLeft && cutRight, 'Cutting should preserve both wall sections around the selected span');
assert.ok(cutLeft.userData.editorBounds.getSize(new RealThree.Vector3()).length() > 10 &&
    cutRight.userData.editorBounds.getSize(new RealThree.Vector3()).length() > 10,
    'Both remaining wall sections should have nonzero length');
api.undoEditorChange();
assert.equal(api.objects.has(fenceId), true,
    `Undo should restore the complete original wall; status=${doc.getElementById('editor-status').textContent}`);
api.redoEditorChange();
assert.equal(api.objects.has('wall-cut-1-left'), true,
    `Redo should restore the partial cut; ids=${[...api.objects.keys()].filter(id => id.startsWith('wall-cut-')).join(',')}`);
assert.equal(api.mode, true);
assert.equal(doc.body.classList.contains('editing'), true);
assert.equal(doc.getElementById('editor-topbar').hidden, false);
assert.equal(doc.getElementById('editor-x').disabled, false);

click(env, 'editor-add');
const crate = api.selected[0];
assert.ok(crate);
const crateBaseWidth = Number(doc.getElementById('editor-sx').value);
const crateBaseLength = Number(doc.getElementById('editor-sz').value);
assert.ok(crateBaseWidth > 0 && crateBaseLength > 0, 'Selected object dimensions should be shown in scene units');
change(env, 'editor-sx', crateBaseWidth * 2);
near(crate.scale.x, 2); near(crate.scale.y, 2); near(crate.scale.z, 2);
assert.ok(Math.abs(Number(doc.getElementById('editor-sx').value) - crateBaseWidth * 2) < .02,
    'Width field should show the updated real dimension');
click(env, 'editor-undo'); near(crate.scale.x, 1);
click(env, 'editor-redo'); near(crate.scale.x, 2);
change(env, 'editor-sx', -4); near(crate.scale.x, .05);
click(env, 'editor-undo'); near(crate.scale.x, 2);
change(env, 'editor-x', ''); assert.notEqual(crate.position.x, 0, 'Empty coordinate must not teleport to zero');
change(env, 'editor-y', 3); near(crate.position.y, 3);
change(env, 'editor-angle', 45); near(crate.rotation.y, Math.PI / 4);
click(env, 'editor-rotate');
assert.equal(api.transformControls.showY, true);
assert.equal(api.transformControls.showX, false);
click(env, 'editor-scale'); assert.equal(api.transformControls.mode, 'scale');
doc.getElementById('editor-uniform').checked = false;
change(env, 'editor-sz', crateBaseLength * 3);
near(crate.scale.z, 3); near(crate.scale.x, 2);
assert.ok(Math.abs(Number(doc.getElementById('editor-sz').value) - crateBaseLength * 3) < .02,
    'Length field should show the updated real dimension');
change(env, 'editor-name', 'ทดสอบลัง');
assert.equal(crate.userData.editor.label, 'ทดสอบลัง');
click(env, 'editor-duplicate');
assert.equal(api.selected.length, 1);
const copy = api.selected[0];
near(copy.scale.z, 3); near(copy.position.y, 3);
click(env, 'editor-delete'); assert.equal(api.objects.has(copy.userData.editor.id), false);
click(env, 'editor-undo'); assert.equal(api.objects.has(copy.userData.editor.id), true);
click(env, 'editor-redo'); assert.equal(api.objects.has(copy.userData.editor.id), false);

for (const type of ['roadSegment', 'roadSign', 'spiritHouse', 'parkedCar']) {
    change(env, 'editor-add-type', type);
    click(env, 'editor-add');
    const procedural = api.selected[0];
    assert.equal(procedural.userData.editor.type, type);
    assert.ok(procedural.userData.editorBounds.getSize(new RealThree.Vector3()).length() > .5,
        `${type} should create visible geometry`);
    click(env, 'editor-delete');
}
change(env, 'editor-add-type', 'blueCrate');

click(env, 'editor-add-preset');
await Promise.resolve();
const externalModel = api.selected[0];
assert.equal(externalModel.userData.editor.type, 'externalModel');
assert.match(externalModel.userData.editor.asset.url, /^https:\/\/cdn\.jsdelivr\.net\//);
assert.equal(externalModel.userData.externalPlaceholder, undefined,
    'Loaded CDN models should replace the loading placeholder');
const stateWithExternalModel = api.saveEditorLayout();
const externalEntry = stateWithExternalModel.added.find(entry => entry.id === externalModel.userData.editor.id);
assert.equal(externalEntry.asset.url, externalModel.userData.editor.asset.url,
    'External asset metadata must persist in the additive layout record');
click(env, 'editor-delete');

api.selectEditable(crate);
const worldBefore = crate.getWorldPosition(new RealThree.Vector3());
const office = api.objects.get('building-main_office');
api.selectEditable(office, true);
assert.equal(api.selected.length, 2);
click(env, 'editor-shrink');
click(env, 'editor-undo');
near(crate.getWorldPosition(new RealThree.Vector3()).x, worldBefore.x);
click(env, 'editor-redo');
const savedGroupScale = crate.getWorldScale(new RealThree.Vector3()).x;
api.selectEditable(null);
near(crate.scale.x, savedGroupScale);

api.selectEditable(office);
click(env, 'editor-duplicate');
const officeCopy = api.selected[0];
assert.equal(officeCopy.userData.editor.sourceId, 'building-main_office');
assert.equal(officeCopy.children.length, office.children.length);
change(env, 'editor-x', 70);
change(env, 'editor-name', 'Office copy');
const cloneId = officeCopy.userData.editor.id;
assert.equal(doc.getElementById('editor-front').disabled, false);
assert.equal(doc.getElementById('editor-back').getAttribute('aria-pressed'), 'true');
api.selectEditable(officeCopy);
click(env, 'editor-front');
assert.equal(officeCopy.userData.editor.renderMode, 'front');
assert.equal(doc.getElementById('editor-front').getAttribute('aria-pressed'), 'true');
assert.equal(api.materials.officeWhite.depthTest, true, 'Front mode must not mutate shared materials');
let frontRenderedMeshes = 0;
officeCopy.traverse(object => {
    if (!object.isMesh) return;
    frontRenderedMeshes += 1;
    assert.equal(object.renderOrder, 1000);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
        assert.equal(material.depthTest, false);
        assert.equal(material.depthWrite, false);
    });
});
assert.ok(frontRenderedMeshes > 0);
assert.equal(JSON.parse(win.localStorage.getItem('tdk-v7-object-layout-v1')).objects[cloneId].renderMode, 'front');
click(env, 'editor-back');
assert.equal(officeCopy.userData.editor.renderMode, 'back');
assert.equal(doc.getElementById('editor-back').getAttribute('aria-pressed'), 'true');
click(env, 'editor-front');

change(env, 'editor-add-type', 'building');
click(env, 'editor-add');
assert.equal(api.selected[0].userData.editor.type, 'building');
click(env, 'editor-undo');
assert.equal(api.objects.has(api.selected[0]?.userData.editor.id), false);
click(env, 'editor-redo');
assert.equal(api.selected[0].userData.editor.type, 'building');

doc.querySelector('#editor-topbar [data-view="top"]').click();
assert.equal(api.mode, true, 'Changing views must retain editor workspace');
assert.equal(api.camera.isOrthographicCamera, true);
click(env, 'editor-focus');
click(env, 'editor-panels'); assert.equal(doc.body.classList.contains('panels-collapsed'), true);
click(env, 'editor-panels'); assert.equal(doc.body.classList.contains('panels-collapsed'), false);
click(env, 'editor-reference-toggle'); assert.equal(doc.getElementById('editor-reference').hidden, false);
click(env, 'reference-satellite'); assert.ok(doc.getElementById('editor-reference-image').src.endsWith('factory-satellite.png'));

// Browser fullscreen event handling, including failure fallback.
doc.documentElement.requestFullscreen = async () => { Object.defineProperty(doc, 'fullscreenElement', { configurable: true, value: doc.documentElement }); doc.dispatchEvent(new win.Event('fullscreenchange')); };
doc.exitFullscreen = async () => { Object.defineProperty(doc, 'fullscreenElement', { configurable: true, value: null }); doc.dispatchEvent(new win.Event('fullscreenchange')); };
click(env, 'editor-fullscreen'); await Promise.resolve();
assert.equal(doc.getElementById('editor-fullscreen').getAttribute('aria-pressed'), 'true');
click(env, 'editor-fullscreen'); await Promise.resolve();
assert.equal(doc.getElementById('editor-fullscreen').getAttribute('aria-pressed'), 'false');

// Presentation show is additive UI only: it tours the camera, updates live time,
// enters fullscreen, and leaves the locked object layout untouched.
const layoutBeforePresentation = win.localStorage.getItem('tdk-v7-object-layout-v1');
assert.equal(doc.getElementById('presentation-show').parentElement.id, 'viewport');
assert.equal(doc.getElementById('presentation-exit'), null, 'Presentation must not show an exit button');
assert.equal(doc.getElementById('presentation-language'), null, 'Greeting must not include a language badge');
assert.equal(doc.getElementById('presentation-voice'), null, 'Presentation must not show a welcome voice button');
assert.equal(doc.querySelector('.presentation-hint'), null, 'Presentation must not show the camera tour hint');
assert.ok(doc.getElementById('presentation-focus-card'), 'Executive focus card must exist');
assert.ok(doc.getElementById('presentation-previous') && doc.getElementById('presentation-pause') &&
    doc.getElementById('presentation-next'), 'Compact tour controls must exist');
assert.match(doc.getElementById('presentation-layout-image').src, /\/references\/[^/]+\.png$/);
click(env, 'presentation-start'); await Promise.resolve();
assert.equal(win.TDK_FACTORY_MAP.presentationActive, true);
assert.equal(doc.getElementById('presentation-show').hidden, false);
assert.equal(doc.body.classList.contains('presentation-show-active'), true);
assert.equal(doc.getElementById('presentation-weather').textContent, '☀ กลางวัน');
assert.equal(doc.getElementById('presentation-greeting').textContent, 'ยินดีต้อนรับสู่ TDK Industrial');
api.renderer.frame();
assert.notEqual(doc.getElementById('presentation-time').textContent, '--:--:--');
assert.ok(doc.getElementById('presentation-date').textContent.length > 5);
api.updatePresentationShow(api.presentationStartedAt + 4500);
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), false);
api.updatePresentationShow(api.presentationStartedAt + 8000);
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), true,
    'Factory layout must appear immediately after the first welcome');
api.updatePresentationShow(api.presentationStartedAt + 16000);
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), false,
    'Opening layout insert must clear before the next greeting');
api.updatePresentationShow(api.presentationStartedAt + 18000);
assert.equal(doc.getElementById('presentation-greeting').textContent, 'Welcome to TDK Industrial');
api.updatePresentationShow(api.presentationStartedAt + 28000);
assert.equal(doc.getElementById('presentation-weather').textContent, '🌙 กลางคืน');
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), true,
    'Factory layout must cover the day-to-night transition');
api.updatePresentationShow(api.presentationStartedAt + 36000);
assert.equal(doc.getElementById('presentation-greeting').textContent,
    'TDK 인더스트리얼에 오신 것을 환영합니다');
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), false);
api.updatePresentationShow(api.presentationStartedAt + 55000);
assert.equal(doc.getElementById('presentation-weather').textContent, '🌧 ฝนตก');
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), true,
    'Factory layout must recur for the night-to-rain transition');
assert.equal(doc.getElementById('presentation-welcome').classList.contains('is-visible'), false,
    'Greeting must not cover a periodic layout insert');
api.updatePresentationShow(api.presentationStartedAt + 82000);
assert.equal(doc.getElementById('presentation-weather').textContent, '🌫 หมอก');
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), true,
    'Factory layout must recur for the rain-to-fog transition');
api.updatePresentationShow(api.presentationStartedAt + 154000);
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), true,
    'Factory layout must bridge Version 1 and the building presentation');
assert.equal(doc.getElementById('presentation-focus-card').hidden, true);
api.updatePresentationShow(api.presentationStartedAt + 162000);
assert.equal(doc.getElementById('presentation-focus-card').hidden, false);
assert.equal(doc.getElementById('presentation-focus-title').textContent, 'Main Office');
assert.equal(doc.querySelectorAll('#presentation-focus-zones span').length, 5);
assert.match(doc.getElementById('presentation-weather').textContent, /EXECUTIVE TOUR/);
assert.equal(doc.getElementById('presentation-focus-card').dataset.placement, 'bottom-left');
api.updatePresentationShow(api.presentationStartedAt + 175000);
assert.equal(doc.getElementById('presentation-focus-title').textContent, 'DIE-SET');
assert.equal(doc.querySelectorAll('#presentation-focus-zones span').length, 6);
api.updatePresentationShow(api.presentationStartedAt + 227000);
assert.equal(doc.getElementById('presentation-focus-title').textContent, 'โดมเก็บแร็ค');
api.updatePresentationShow(api.presentationStartedAt + 239000);
assert.equal(doc.getElementById('presentation-show').classList.contains('layout-visible'), false,
    'Closing chapter must stay on the 3D scene without a layout insert');
for (const [index, stop] of api.presentationTourStops.entries()) {
    const group = api.presentationBuildingGroups.get(stop.buildingId);
    const front = new RealThree.Vector3(0, 0, 1)
        .applyQuaternion(group.getWorldQuaternion(new RealThree.Quaternion())).setY(0).normalize();
    const cameraDirection = api.presentationStopPoses[index].position.clone()
        .sub(api.presentationStopPoses[index].target).setY(0).normalize();
    assert.ok(cameraDirection.dot(front) > .9, `${stop.buildingId} camera must face the front facade`);
}
for (const buildingId of ['doke1_west', 'doke1_store', 'doke2_assy']) {
    const index = api.presentationTourStops.findIndex(stop => stop.buildingId === buildingId);
    const pose = api.presentationStopPoses[index];
    const horizontalDistance = Math.hypot(
        pose.position.x - pose.target.x,
        pose.position.z - pose.target.z
    );
    assert.ok(pose.position.y - pose.target.y > horizontalDistance * .65,
        `${buildingId} must use the requested high-angle presentation camera`);
}
click(env, 'presentation-pause');
assert.equal(doc.getElementById('presentation-pause').getAttribute('aria-pressed'), 'true');
click(env, 'presentation-pause');
assert.equal(doc.getElementById('presentation-pause').getAttribute('aria-pressed'), 'false');
assert.equal(api.objects.get('building-main_office').visible, true,
    'Presentation tour must leave Main Office exterior in the normal scene');
assert.equal(win.localStorage.getItem('tdk-v7-object-layout-v1'), layoutBeforePresentation);
await win.TDK_FACTORY_MAP.stopPresentation(); await Promise.resolve();
assert.equal(win.TDK_FACTORY_MAP.presentationActive, false);
assert.equal(doc.getElementById('presentation-show').hidden, true);
assert.equal(api.objects.get('building-main_office').visible, true);

api.saveEditorLayout();
const saved = win.localStorage.getItem('tdk-v7-object-layout-v1');
const reloaded = boot(saved);
assert.ok(reloaded.api.objects.has('wall-cut-1-left') &&
    reloaded.api.objects.has('wall-cut-1-right'),
    'Saved wall cuts should be reconstructed after reloading the scene');
assert.equal(reloaded.api.objects.get(cloneId).userData.editor.label, 'Office copy');
near(reloaded.api.objects.get(cloneId).position.x, 70);
near(reloaded.api.objects.get(crate.userData.editor.id).scale.x, savedGroupScale);
assert.equal(reloaded.api.objects.get(crate.userData.editor.id).userData.editor.label, 'ทดสอบลัง');
assert.equal(reloaded.api.objects.get(cloneId).children.length, office.children.length);
assert.equal(reloaded.api.objects.get(cloneId).userData.editor.renderMode, 'front');
let reloadedFrontMesh = null;
reloaded.api.objects.get(cloneId).traverse(object => { if (!reloadedFrontMesh && object.isMesh) reloadedFrontMesh = object; });
assert.equal(reloadedFrontMesh.renderOrder, 1000);
assert.equal(reloadedFrontMesh.material.depthTest, false);
reloaded.api.renderer.frame();
// A clone must reload even when its built-in source has been deleted.
api.selectEditable(office);
click(env, 'editor-delete');
api.saveEditorLayout();
const withoutSource = boot(win.localStorage.getItem('tdk-v7-object-layout-v1'));
assert.equal(withoutSource.api.objects.has('building-main_office'), false);
assert.equal(withoutSource.api.objects.get(cloneId).children.length, office.children.length);
withoutSource.api.renderer.frame();
const customCamera = boot(undefined, JSON.stringify({
    position: [12, 140, 175], target: [26, 2, 10], fov: 45
}), 'photo');
near(customCamera.api.camera.position.x, 12);
near(customCamera.api.camera.fov, 45);
const migratedCamera = boot(undefined, JSON.stringify({
    position: [-78, 150, 210], target: [37, 2, 10], fov: 40
}), 'photo');
near(migratedCamera.api.camera.position.x, 117);
near(migratedCamera.api.camera.fov, 42);
const migratedCurrentCamera = boot(undefined, JSON.stringify({
    position: [8, 120, 170], target: [25, 2, 10], fov: 46
}), 'photo');
near(migratedCurrentCamera.api.camera.position.x, 117);
near(migratedCurrentCamera.api.camera.fov, 42);
const migratedLayout = boot(JSON.stringify({
    revision: 10,
    objects: {
        'building-doke2_assy': {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            label: 'Old Doke 2'
        }
    },
    added: [],
    deleted: []
}));
near(migratedLayout.api.objects.get('building-doke2_assy').position.x,
    31 * migratedLayout.win.TDK_LAYOUT.SITE.renderUnitsPerSiteUnit);
near(migratedLayout.api.objects.get('building-doke2_assy').position.z,
    -10.5 * migratedLayout.win.TDK_LAYOUT.SITE.renderUnitsPerSiteUnit);
assert.ok(migratedLayout.win.localStorage.getItem('tdk-v7-object-layout-v1-backup-r10'));
// Migration keeps custom objects and leaves a recoverable copy of the older layout.
const legacyState = JSON.parse(saved);
legacyState.revision = 6;
const migrated = boot(JSON.stringify(legacyState));
assert.ok(migrated.win.localStorage.getItem('tdk-v7-object-layout-v1-backup-r6'));
near(migrated.api.objects.get('building-main_office').scale.x, 1);
assert.equal(migrated.api.objects.get(cloneId).userData.editor.label, 'Office copy');
const lockedBaseline = JSON.parse(readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'));
const baselineRoundTrip = boot(JSON.stringify(lockedBaseline));
const movingActors = baselineRoundTrip.api.activityActors;
const routeObstacles = baselineRoundTrip.api.activityObstacles;
assert.equal(movingActors.length, 16);
for (const actor of movingActors) {
    assert.ok(actor.navLoop && actor.mesh.visible, 'Every worker and vehicle needs a usable route');
    assert.ok(actor.navLoop.total > 25, 'Activity routes must not collapse into tiny loops');
    const { points } = actor.navLoop;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .5));
        for (let j = 0; j <= steps; j++) {
            const x = a.x + (b.x - a.x) * j / steps;
            const z = a.z + (b.z - a.z) * j / steps;
            assert.ok(routeObstacles.every(box =>
                x < box.minX - actor.clearance || x > box.maxX + actor.clearance ||
                z < box.minZ - actor.clearance || z > box.maxZ + actor.clearance),
            'A moving actor route must stay clear of saved walls and buildings');
        }
    }
}
const initialActorPositions = movingActors.map(actor => actor.mesh.position.clone());
for (let frame = 0; frame < 200; frame++) baselineRoundTrip.api.updateActivity(.05);
movingActors.forEach((actor, index) => {
    assert.ok(actor.mesh.position.distanceTo(initialActorPositions[index]) > .5,
        'Every worker and vehicle should continue moving');
});
const truck = movingActors.at(-1);
let truckOverlap = 0;
for (let length = 0; length < truck.navLoop.total; length += .5) {
    const p = positionOnActivityLoop(truck.navLoop, length / truck.navLoop.total);
    for (const localZ of [-3.5, 0, 3.5, 5.8]) for (const localX of [-1.5, 0, 1.5]) {
        const x = p.x + Math.cos(p.heading) * localX + Math.sin(p.heading) * localZ;
        const z = p.z - Math.sin(p.heading) * localX + Math.cos(p.heading) * localZ;
        if (routeObstacles.some(box => x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ)) truckOverlap++;
    }
}
assert.equal(truckOverlap, 0, 'The truck body must stay clear of saved walls and buildings');
const roundTripState = baselineRoundTrip.api.saveEditorLayout();
const roundTripAudit = auditExportLayout(roundTripState, lockedBaseline);
if (!roundTripAudit.ok) {
    const firstId = roundTripAudit.differences.find(item => item.includes('(changed)'))?.split(' ')[0];
    console.error('Baseline round-trip audit:', roundTripAudit.differences.length, roundTripAudit.differences.slice(0, 5));
    if (firstId) console.error('First round-trip values:', firstId, lockedBaseline.objects[firstId], roundTripState.objects[firstId]);
}
assert.equal(roundTripAudit.ok, true, 'Loading and saving the locked baseline must not create export differences');
const driftedForExport = structuredClone(lockedBaseline);
driftedForExport.objects['building-main_office'].position.x += 1;
const blockedExport = boot(JSON.stringify(driftedForExport));
blockedExport.win.fetch = async url => String(url).includes('layout.json')
    ? { ok: true, json: async () => lockedBaseline }
    : { ok: true, text: async () => '' };
const storedBeforeExport = blockedExport.win.localStorage.getItem('tdk-v7-object-layout-v1');
click(blockedExport, 'editor-export-threejs');
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(blockedExport.win.localStorage.getItem('tdk-v7-object-layout-v1'), storedBeforeExport,
    'A rejected export must not overwrite local storage before the baseline audit');
assert.equal(blockedExport.doc.getElementById('editor-repair-baseline').hidden, false,
    'A rejected export should offer an explicit baseline repair');
assert.ok(blockedExport.doc.getElementById('editor-status').textContent.includes('baseline'));
errors.length = 0; // The expected rejected export logs its reason.
const viewer = boot(JSON.stringify(lockedBaseline), undefined, '', true);
assert.equal(viewer.doc.getElementById('editor-toggle').hidden, true, 'Deploy viewer must hide the editor entry point');
viewer.doc.getElementById('editor-toggle').click();
assert.equal(viewer.api.mode, false, 'Deploy viewer must reject programmatic attempts to enter editor mode');
assert.equal(viewer.win.TDK_OBJECT_EDITOR, undefined, 'Deploy viewer must not expose the editor object registry');
const editorEntry = boot(JSON.stringify(lockedBaseline), undefined, '', false, true);
assert.equal(editorEntry.api.mode, true, 'editor.html entry must open directly in layout editor mode');
assert.equal(editorEntry.doc.getElementById('editor-view-interior').disabled, true);
editorEntry.api.selectEditable(editorEntry.api.objects.get('building-main_office'));
assert.equal(editorEntry.doc.getElementById('editor-view-interior').disabled, false);
click(editorEntry, 'editor-view-interior');
assert.equal(editorEntry.api.mode, false, 'Interior preview should leave transform mode');
assert.equal(editorEntry.win.TDK_FACTORY_MAP.activeInterior, 'main_office');
click(editorEntry, 'interior-back');
assert.equal(editorEntry.api.mode, true, 'Interior preview should return to editor');
assert.equal(editorEntry.win.TDK_FACTORY_MAP.activeInterior, null);
click(env, 'editor-done');
assert.equal(api.mode, false);
assert.equal(doc.getElementById('editor-topbar').hidden, true);
assert.deepEqual(errors, []);
console.log(`PASS: editor transforms, undo/redo, add/delete, clone buildings, multi-selection, persistence, view modes, presentation show, fullscreen events; ${api.objects.size} editable objects; no overlapping building footprints.`);
domCleanup();
function domCleanup() { for (const test of [env, reloaded, withoutSource, customCamera, migratedCamera, migratedCurrentCamera, migratedLayout, migrated, baselineRoundTrip, blockedExport, viewer, editorEntry]) test.dom.window.close(); }
