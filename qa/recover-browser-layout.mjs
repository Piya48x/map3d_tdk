import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { auditLayoutAgainstBaseline, prepareBaselineRepair } from '../src/threejs-export.js';
import { CANONICAL_LAYOUT_ID } from '../src/canonical-layout-loader.js';

const cdpPort = Number(process.argv[2] || 9223);
const targetUrl = process.argv[3] || 'http://localhost:5173/storage-recovery.html';
const outputUrl = new URL('../deployments/viewer-layout-2026-11-17.json', import.meta.url);
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const target = targets.find(item => item.url === targetUrl);
assert.ok(target?.webSocketDebuggerUrl, `Chrome target ${targetUrl} was not found`);

const payload = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timeout = setTimeout(() => reject(new Error('Timed out reading browser storage')), 10000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
            expression: `({
                layout: localStorage.getItem('tdk-v7-object-layout-v1'),
                camera: localStorage.getItem('tdk-v7-aerial-reference-camera')
            })`,
            returnByValue: true
        }
    })));
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        socket.close();
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result.result.value);
    });
    socket.addEventListener('error', reject);
});

assert.ok(payload.layout, 'The selected Chrome profile has no saved TDK layout');
const layout = JSON.parse(payload.layout);
const baseline = JSON.parse(await readFile(
    new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'
));
const audit = auditLayoutAgainstBaseline(layout, baseline);
console.log(JSON.stringify({
    revision: layout.revision,
    canonicalBaseline: layout.canonicalBaseline,
    objectCount: Object.keys(layout.objects || {}).length,
    addedCount: layout.added?.length || 0,
    deletedCount: layout.deleted?.length || 0,
    cutCount: layout.cuts?.length || 0,
    auditDifferenceCount: audit.differences.length,
    auditSample: audit.differences.slice(0, 12),
    entranceMonument: layout.objects?.['entrance-tdk-monument-v1'] || null,
    entranceAvenue: layout.objects?.['entrance-landscaped-avenue-v1'] || null,
    camera: payload.camera ? JSON.parse(payload.camera) : null
}, null, 2));
const repair = audit.ok
    ? { layout, keptCount: layout.added?.length || 0, droppedIds: [] }
    : prepareBaselineRepair(layout, baseline, CANONICAL_LAYOUT_ID);
const deploymentLayout = repair.layout;
deploymentLayout.canonicalBaseline = CANONICAL_LAYOUT_ID;
deploymentLayout.deploymentLayout = 'viewer-layout-2026-11-17';

await mkdir(new URL('../deployments/', import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(deploymentLayout, null, 2)}\n`, 'utf8');

const ids = ['entrance-tdk-monument-v1', 'entrance-landscaped-avenue-v1'];
console.log(JSON.stringify({
    output: outputUrl.pathname,
    revision: deploymentLayout.revision,
    objectCount: Object.keys(deploymentLayout.objects || {}).length,
    addedCount: deploymentLayout.added?.length || 0,
    repairedLockedDifferences: audit.differences.length,
    keptNewObjects: repair.keptCount,
    droppedUnregisteredIds: repair.droppedIds,
    recovered: Object.fromEntries(ids.map(id => [id, deploymentLayout.objects?.[id] || null])),
    camera: payload.camera ? JSON.parse(payload.camera) : null
}, null, 2));
