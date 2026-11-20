import './bootstrap.js';
import { loadCanonicalLayout } from './canonical-layout-loader.js';

window.TDK_BUILD_ID = __TDK_BUILD_ID__;
document.documentElement.dataset.tdkBuild = __TDK_BUILD_ID__;

// index.html is the single application entry and always opens the object editor.
// Query parameters may still select a camera/presentation, but they no longer
// select a different application mode or layout source.
window.TDK_VIEWER_ONLY = false;
window.TDK_START_IN_EDITOR = true;

await loadCanonicalLayout();
console.info(`TDK map build ${window.TDK_BUILD_ID} · ${window.TDK_FACTORY_LAYOUT_SOURCE}`);
await import('./main.js');
