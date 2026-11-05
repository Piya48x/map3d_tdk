// Pure, Three.js-free game-input helpers.  Keeping these functions isolated
// makes direction and control regressions easy to test or reuse.

export const GAME_MOVEMENT_CODES = Object.freeze([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'ShiftLeft', 'ShiftRight',
    'Digit1', 'Digit2', 'Digit3'
]);

export function getMovementInput(keys) {
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) -
        (keys.KeyS || keys.ArrowDown ? 1 : 0);
    // Screen-space left/right: this intentionally compensates for the camera
    // following behind the player, where the previous world-axis mapping felt reversed.
    const strafe = (keys.KeyA || keys.ArrowLeft ? 1 : 0) -
        (keys.KeyD || keys.ArrowRight ? 1 : 0);
    return { forward, strafe };
}

export function movementDelta({ forward, strafe, yaw, speed, dt }) {
    const length = Math.hypot(forward, strafe) || 1;
    const normalizedForward = forward / length;
    const normalizedStrafe = strafe / length;
    return {
        x: (Math.sin(yaw) * normalizedForward + Math.cos(yaw) * normalizedStrafe) * speed * dt,
        z: (Math.cos(yaw) * normalizedForward - Math.sin(yaw) * normalizedStrafe) * speed * dt
    };
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

