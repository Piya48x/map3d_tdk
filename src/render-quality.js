// Keep the map sharp on fast devices and lower fill rate only when frames lag.
export function createAdaptiveRenderQuality({ devicePixelRatio, width, height, compact, onChange }) {
    let ratio = 1;
    let ceiling = 1;
    let floor = 1;
    let elapsed = 0;
    let frames = 0;
    let fastWindows = 0;

    function limits(nextWidth, nextHeight, nextCompact) {
        const pixels = Math.max(1, nextWidth * nextHeight);
        ceiling = Math.max(1, Math.min(devicePixelRatio || 1,
            nextCompact ? 1.5 : 1.75, Math.sqrt(4_500_000 / pixels)));
        floor = Math.min(ceiling, nextCompact ? 1 : 1.1);
    }

    function apply(next) {
        const clamped = Math.max(floor, Math.min(ceiling, Math.round(next * 20) / 20));
        if (Math.abs(clamped - ratio) < .025) return;
        ratio = clamped;
        onChange(ratio);
    }

    limits(width, height, compact);
    apply(Math.min(ceiling, compact ? 1.2 : 1.4));

    return {
        get pixelRatio() { return ratio; },
        get maximumPixelRatio() { return ceiling; },
        resize(nextWidth, nextHeight, nextCompact) {
            limits(nextWidth, nextHeight, nextCompact);
            apply(ratio);
        },
        sample(frameSeconds) {
            if (!Number.isFinite(frameSeconds) || frameSeconds <= 0 || frameSeconds > .25) return;
            elapsed += frameSeconds;
            frames++;
            if (elapsed < 2) return;
            const average = elapsed / frames;
            elapsed = 0;
            frames = 0;
            if (average > 1 / 38) {
                fastWindows = 0;
                apply(ratio - .15);
            } else if (average < 1 / 54) {
                fastWindows++;
                if (fastWindows >= 3) {
                    fastWindows = 0;
                    apply(ratio + .1);
                }
            } else fastWindows = 0;
        }
    };
}
