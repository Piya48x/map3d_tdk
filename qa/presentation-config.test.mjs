import assert from 'node:assert/strict';
import {
    presentationGreetings,
    PRESENTATION_OPENING_DURATION,
    PRESENTATION_LAYOUT_BRIDGE_DURATION,
    PRESENTATION_LAYOUT_TRANSITION_LEAD,
    PRESENTATION_ENVIRONMENT_TRANSITION_DURATION,
    PRESENTATION_STOP_DURATION,
    PRESENTATION_CLOSING_DURATION,
    presentationWeatherSequence,
    presentationTourDuration
} from '../src/presentation/presentation-config.js';

assert.deepEqual(presentationGreetings.map(item => item.locale), ['th-TH', 'en-US', 'ko-KR']);
assert.equal(PRESENTATION_OPENING_DURATION, 150000);
assert.equal(PRESENTATION_LAYOUT_BRIDGE_DURATION, 8000);
assert.equal(PRESENTATION_LAYOUT_TRANSITION_LEAD + PRESENTATION_ENVIRONMENT_TRANSITION_DURATION,
    PRESENTATION_LAYOUT_BRIDGE_DURATION,
    'Periodic layout insert must cover the entire weather transition');
assert.deepEqual(presentationWeatherSequence, ['day', 'night', 'rain', 'fog', 'day', 'night']);
assert.equal(presentationTourDuration(6),
    PRESENTATION_OPENING_DURATION + PRESENTATION_LAYOUT_BRIDGE_DURATION +
    6 * PRESENTATION_STOP_DURATION + PRESENTATION_CLOSING_DURATION);
assert.equal(presentationTourDuration(6), 248000);

console.log('PASS: modular presentation timeline retains Version 1, layout bridge, six building stops, and finale');
