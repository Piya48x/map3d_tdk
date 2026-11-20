import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const deploymentUrl = new URL(process.argv[2] || 'https://map3dtdk.vercel.app/');
const expectedMeta = JSON.parse(await readFile(new URL('../dist/build-meta.json', import.meta.url), 'utf8'));
const expectedCanonicalHash = expectedMeta.canonicalLayout.split(':').at(-1);
const cacheBust = `verify=${Date.now()}`;

async function checkedFetch(path) {
    const url = new URL(path, deploymentUrl);
    url.search = cacheBust;
    const response = await fetch(url, { cache: 'no-store' });
    assert.equal(response.ok, true, `${url} returned ${response.status}`);
    return response;
}

const liveMeta = await (await checkedFetch('./build-meta.json')).json();
assert.equal(liveMeta.buildId, expectedMeta.buildId,
    `Production build ${liveMeta.buildId} does not match local build ${expectedMeta.buildId}`);
assert.equal(liveMeta.canonicalLayout, expectedMeta.canonicalLayout,
    'Production references a different canonical layout');
assert.equal(liveMeta.deploymentLayout, expectedMeta.deploymentLayout,
    'Production references a different deployment layout');

const canonicalBytes = Buffer.from(await (await checkedFetch(
    './snapshots/baseline-2026-11-05/layout.json'
)).arrayBuffer());
const liveCanonicalHash = createHash('sha256').update(canonicalBytes).digest('hex');
assert.equal(liveCanonicalHash, expectedCanonicalHash,
    'Production canonical snapshot checksum does not match the locked baseline');

const deploymentBytes = Buffer.from(await (await checkedFetch(
    './deployments/viewer-layout-2026-11-17.json'
)).arrayBuffer());
const liveDeploymentHash = createHash('sha256').update(deploymentBytes).digest('hex');
assert.equal(liveDeploymentHash, expectedMeta.deploymentLayoutSha256,
    'Production deployment layout checksum does not match the recovered map');

console.log(`PASS: ${deploymentUrl.origin} serves build ${liveMeta.buildId}, canonical ${liveCanonicalHash}, and deployment map ${liveDeploymentHash}`);
