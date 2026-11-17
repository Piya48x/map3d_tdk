import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = new URL('./', import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);
const canonicalLayoutId = 'baseline-2026-11-05:263c223a07fdfa1c88ba80aed1d1e3c3dbbe9f181a1e5a89c9a8526c535fd004';
const buildSourceFiles = [
    './src/entry.js', './src/canonical-layout-loader.js', './src/main.js',
    './src/factory-data.js', './src/app-config.js', './index.html'
];
const buildId = createHash('sha256')
    .update(buildSourceFiles.map(file => readFileSync(new URL(file, projectRoot))).join('\n'))
    .digest('hex').slice(0, 16);

// Runtime editor/export features still request these stable paths. Emit exact
// copies in addition to Vite's hashed viewer assets so both workflows work.
function stableRuntimeAssets() {
    return {
        name: 'tdk-stable-runtime-assets',
        apply: 'build',
        buildStart() {
            for (const name of readdirSync(new URL('./references/', projectRoot))) {
                if (!/\.(png|jpe?g|webp|svg)$/i.test(name)) continue;
                this.emitFile({
                    type: 'asset',
                    fileName: `references/${name}`,
                    source: readFileSync(new URL(`./references/${name}`, projectRoot))
                });
            }
            this.emitFile({
                type: 'asset',
                fileName: 'snapshots/baseline-2026-11-05/layout.json',
                source: readFileSync(new URL('./snapshots/baseline-2026-11-05/layout.json', projectRoot))
            });
            this.emitFile({
                type: 'asset',
                fileName: 'tdk-factory-map.js',
                source: readFileSync(new URL('./tdk-factory-map.js', projectRoot))
            });
            this.emitFile({
                type: 'asset',
                fileName: 'build-meta.json',
                source: JSON.stringify({ buildId, canonicalLayout: canonicalLayoutId }, null, 2)
            });
        }
    };
}

export default defineConfig({
    base: './',
    publicDir: false,
    plugins: [stableRuntimeAssets()],
    define: { __TDK_BUILD_ID__: JSON.stringify(buildId) },
    server: { host: '0.0.0.0' },
    preview: { host: '0.0.0.0' },
    build: {
        target: 'es2022',
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            input: resolve(projectRootPath, 'index.html'),
            output: {
                manualChunks(id) {
                    if (id.includes('/node_modules/three/')) return 'three';
                }
            }
        }
    }
});
