const freezeItems = items => Object.freeze(items.map(item => Object.freeze(item)));

export const presentationGreetings = freezeItems([
    {
        locale: 'th-TH',
        greeting: 'ยินดีต้อนรับสู่ TDK Industrial',
        subtitle: 'ทัวร์ชมโรงงานแบบสามมิติ'
    },
    {
        locale: 'en-US',
        greeting: 'Welcome to TDK Industrial',
        subtitle: 'A guided three-dimensional factory tour'
    },
    {
        locale: 'ko-KR',
        greeting: 'TDK 인더스트리얼에 오신 것을 환영합니다',
        subtitle: '3차원 공장 안내 투어'
    }
]);

export const PRESENTATION_GREETING_DURATION = 18000;
export const PRESENTATION_GREETING_VISIBLE_DURATION = 7200;
export const PRESENTATION_WEATHER_DURATION = 27000;
export const PRESENTATION_OPENING_DURATION = 150000;
export const PRESENTATION_LAYOUT_BRIDGE_DURATION = 8000;
export const PRESENTATION_LAYOUT_TRANSITION_LEAD = 1500;
export const PRESENTATION_ENVIRONMENT_TRANSITION_DURATION = 6500;
export const PRESENTATION_STOP_DURATION = 13000;
export const PRESENTATION_TRAVEL_DURATION = 3500;
export const PRESENTATION_CLOSING_DURATION = 12000;

export const presentationOverviewPositionPoints = freezeItems([
    [-142, 150, 158], [-68, 82, 104], [16, 178, 32], [86, 78, 104],
    [152, 132, -98], [38, 190, -42], [-66, 82, -116], [-158, 132, 38]
]);

export const presentationOverviewTargetPoints = freezeItems([
    [2, 6, 0], [-18, 5, 28], [2, 3, -4], [18, 6, 12],
    [16, 7, -26], [2, 3, -12], [-12, 6, -30], [-4, 7, 4]
]);

export const presentationEnvironmentLabels = Object.freeze({
    day: '☀ กลางวัน',
    night: '🌙 กลางคืน',
    rain: '🌧 ฝนตก',
    fog: '🌫 หมอก'
});

export const presentationWeatherSequence = Object.freeze([
    'day', 'night', 'rain', 'fog', 'day', 'night'
]);

export function presentationTourDuration(stopCount) {
    return PRESENTATION_OPENING_DURATION + PRESENTATION_LAYOUT_BRIDGE_DURATION +
        stopCount * PRESENTATION_STOP_DURATION +
        PRESENTATION_CLOSING_DURATION;
}
