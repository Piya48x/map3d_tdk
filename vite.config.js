import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = new URL('./', import.meta.url);
const projectRootPath = fileURLToPath(projectRoot);

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
        }
    };
}

export default defineConfig({
    base: './',
    publicDir: false,
    plugins: [stableRuntimeAssets()],
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
