import './bootstrap.js';
import { loadCanonicalLayout } from './canonical-layout-loader.js';

const localEditorHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
window.TDK_VIEWER_ONLY = !(localEditorHost && new URLSearchParams(location.search).get('editor') === '1');

await loadCanonicalLayout();
await import('./main.js');
