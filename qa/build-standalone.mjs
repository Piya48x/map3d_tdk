import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { auditLayoutAgainstBaseline } from '../src/threejs-export.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const templatePath = new URL('../tdk-factory-map.js', import.meta.url);
const template = readFileSync(templatePath, 'utf8');
const baseline = JSON.parse(readFileSync(new URL('../snapshots/baseline-2026-11-05/layout.json', import.meta.url), 'utf8'));
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const styleStart = template.indexOf("const style=document.createElement('style');");
const styleEnd = template.indexOf('\n', styleStart);
const hostStart = template.indexOf("const host=document.createElement('div');", styleEnd);
const hostEnd = template.indexOf('\n', hostStart);
assert.ok(styleStart >= 0 && styleEnd > styleStart && hostStart > styleEnd && hostEnd > hostStart,
    'Standalone HTML/CSS wrapper markers must exist');
const oldStyleLine = template.slice(styleStart, styleEnd);
const oldCssLiteral = oldStyleLine.slice(oldStyleLine.indexOf('style.textContent=') + 'style.textContent='.length,
    oldStyleLine.indexOf(';document.head.appendChild(style);'));
const oldCss = JSON.parse(oldCssLiteral);
const overrideStart = oldCss.lastIndexOf('\nbody.tdk-standalone-map #editor-toggle');
assert.ok(overrideStart >= 0, 'Standalone viewer-only CSS overrides must exist');
const overrides = oldCss.slice(overrideStart);
const css = ['viewer.css', 'responsive.css', 'editor-workspace.css']
    .map(name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')).join('\n') + overrides;
const bodyStart = indexHtml.indexOf('<body>') + '<body>'.length;
const bodyEnd = indexHtml.indexOf('<script src="./src/bootstrap.js"', bodyStart);
assert.ok(bodyStart >= '<body>'.length && bodyEnd > bodyStart, 'Current index body markers must exist');
const aerialPng = readFileSync(new URL('../references/factory-aerial.png', import.meta.url)).toString('base64');
const markup = indexHtml.slice(bodyStart, bodyEnd)
    .replace(/(<img id="reference-overlay" src=")[^"]+"/,
        `$1data:image/png;base64,${aerialPng}"`)
    .replace(/(id="editor-reference-image" src=")[^"]+"/,
        '$1data:,"');
assert.ok(markup.includes(`id="reference-overlay" src="data:image/png;base64,${aerialPng.slice(0, 20)}`),
    'Standalone reference overlay must be embedded for use in another project');
assert.ok(markup.includes('id="editor-reference-image" src="data:,"'));
const requiredIds = [...mainSource.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)]
    .map(match => match[1]);
for (const id of requiredIds) {
    assert.ok(markup.includes(`id="${id}"`), `Standalone host is missing #${id}`);
}
const styleLine = `const style=document.createElement('style');style.dataset.tdkFactoryMap='standalone';style.textContent=${JSON.stringify(css)};document.head.appendChild(style);`;
const hostLine = `const host=document.createElement('div');host.id='tdk-factory-map-root';host.innerHTML=${JSON.stringify(markup)};document.body.appendChild(host);host.querySelector('#editor-reference-image').src=host.querySelector('#reference-overlay').src;`;
const withCurrentHost = template.slice(0, styleStart) + styleLine + '\n' + hostLine + template.slice(hostEnd);

const embeddedStart = withCurrentHost.indexOf('const embeddedLayout=');
const embeddedEnd = withCurrentHost.indexOf(',embeddedCamera=', embeddedStart);
assert.ok(embeddedStart >= 0 && embeddedEnd > embeddedStart, 'Standalone embedded layout markers must exist');
const embedded = JSON.parse(withCurrentHost.slice(embeddedStart + 'const embeddedLayout='.length, embeddedEnd));
assert.equal(auditLayoutAgainstBaseline(embedded, baseline).ok, true,
    'Standalone template must retain the locked baseline');

const runtimeStartMarker = '// TDK standalone runtime start\n';
const runtimeEndMarker = '// TDK standalone runtime end\n';
const markedRuntimeStart = withCurrentHost.indexOf(runtimeStartMarker, embeddedEnd);
const coreStart = markedRuntimeStart >= 0
    ? markedRuntimeStart
    : withCurrentHost.indexOf('(() => {', withCurrentHost.indexOf('// Locked export:'));
const tailMarker = "window.dispatchEvent(new Event('resize'));";
const coreEnd = markedRuntimeStart >= 0
    ? withCurrentHost.indexOf(runtimeEndMarker, markedRuntimeStart) + runtimeEndMarker.length
    : withCurrentHost.lastIndexOf(tailMarker);
assert.ok(coreStart > embeddedEnd && coreEnd > coreStart, 'Standalone runtime markers must exist');

const built = await build({
    entryPoints: [resolve(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    nodePaths: [resolve(root, 'qa/node_modules')],
    legalComments: 'none',
    minify: true,
    write: false,
    logLevel: 'silent'
});
const runtime = built.outputFiles[0].text.trimEnd().replace(/[ \t]+$/gm, '');
const result = withCurrentHost.slice(0, coreStart) + runtimeStartMarker + runtime + '\n' +
    runtimeEndMarker + withCurrentHost.slice(coreEnd);
assert.doesNotThrow(() => new Function(result), 'Rebuilt standalone template must parse');

if (process.argv.includes('--check')) {
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(hash(result), hash(template), 'Standalone runtime is stale; run npm run build:standalone in qa');
    console.log('PASS: standalone runtime matches src/main.js');
} else {
    writeFileSync(templatePath, result);
    console.log('Built standalone runtime from src/main.js; locked embedded layout retained');
}
