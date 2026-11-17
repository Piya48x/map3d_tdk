import './bootstrap.js';
import { loadCanonicalLayout } from './canonical-layout-loader.js';

window.TDK_BUILD_ID = __TDK_BUILD_ID__;
document.documentElement.dataset.tdkBuild = __TDK_BUILD_ID__;

const localEditorHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
window.TDK_VIEWER_ONLY = !(localEditorHost && new URLSearchParams(location.search).get('editor') === '1');

await loadCanonicalLayout();
console.info(`TDK map build ${window.TDK_BUILD_ID} · ${window.TDK_FACTORY_LAYOUT_SOURCE}`);
await import('./main.js');
