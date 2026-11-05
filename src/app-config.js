// Central configuration shared by the scene, editor and gameplay systems.
// Keep measured layout data in index.html until the scene builders are split;
// runtime tuning belongs here so it has one source of truth.

export const SITE = Object.freeze({
    units: 'proportional',
    width: 100,
    depth: 108,
    bounds: Object.freeze({ minX: -50, maxX: 50, entranceZ: 50, rearZ: -56.5 }),
    renderBounds: Object.freeze({ minX: -77, maxX: 77, entranceZ: 77, rearZ: -87 }),
    renderUnitsPerSiteUnit: 1.54,
    axes: Object.freeze({ x: 'cross-site', y: 'height', z: 'entrance-to-rear' }),
    orientation: 'Gate at +Z; rear production zone toward -Z'
});

export const GAME_CONFIG = Object.freeze({
    playerRadius: .72,
    walkSpeed: 7.1,
    runSpeed: 13.2,
    jumpVelocity: 9.1,
    gravity: 24,
    eyeHeight: 2.35,
    spawn: Object.freeze({ x: 0, y: 34, z: 0 }),
    mouseSensitivity: .00175,
    touchSensitivity: .01,
    minPitch: -1.25,
    maxPitch: 1.25,
    firstPerson: true,
    weaponDamage: Object.freeze({ unarmed: 12, knife: 48, pistol: 34 }),
    weaponRange: Object.freeze({ unarmed: 1.75, knife: 3.1, pistol: 120 })
});
