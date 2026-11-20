import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const debugPort = Number(process.env.TDK_CHROME_DEBUG_PORT || 9333);
const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: node capture-aerial-shot.mjs <output.png>');

const chromePath = process.env.TDK_CHROME_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profilePath = await mkdtemp(join(tmpdir(), 'tdk-aerial-shot-'));
const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`,
    '--window-size=1917,914', 'http://localhost:5173/'
], { windowsHide: true, stdio: 'ignore' });

try {
    let pages = null;
    for (let attempt = 0; attempt < 40 && !pages; attempt++) {
        try {
            pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
        } catch {
            await new Promise(resolveWait => setTimeout(resolveWait, 200));
        }
    }
    if (!pages) throw new Error('Headless Chrome debug endpoint did not start');
    const page = pages.find(item => item.type === 'page' && item.url.startsWith('http://localhost:5173/'));
    if (!page?.webSocketDebuggerUrl) throw new Error('TDK page was not found on the Chrome debug port');

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => {
        socket.addEventListener('open', resolveOpen, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });

    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id || !pending.has(message.id)) return;
        const handlers = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) handlers.reject(new Error(message.error.message));
        else handlers.resolve(message.result);
    });

    function command(method, params = {}) {
        const id = ++sequence;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolveCommand, reject) => pending.set(id, { resolve: resolveCommand, reject }));
    }

    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', {
        width: 1917, height: 914, deviceScaleFactor: 1, mobile: false
    });
    let appReady = false;
    for (let attempt = 0; attempt < 50 && !appReady; attempt++) {
        try {
            const readyResult = await command('Runtime.evaluate', {
                expression: `Boolean(window.TDK_FACTORY_MAP && document.body.classList.contains('editing'))`,
                returnByValue: true
            });
            appReady = readyResult.result?.value === true;
        } catch (error) {
            if (!String(error.message).includes('Execution context was destroyed')) throw error;
        }
        if (!appReady) await new Promise(resolveWait => setTimeout(resolveWait, 200));
    }
    if (!appReady) throw new Error('TDK map did not finish loading in headless Chrome');
    await command('Runtime.evaluate', {
        expression: `(() => {
            document.getElementById('editor-done').click();
            document.querySelector('.viewer-controls [data-view="photo"]').click();
            document.body.classList.remove('panels-collapsed');
            window.dispatchEvent(new Event('resize'));
        })()`
    });
    await new Promise(resolveWait => setTimeout(resolveWait, 2500));
    const { data } = await command('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false
    });
    await writeFile(outputPath, Buffer.from(data, 'base64'));
    socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' }));
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
    socket.close();
    console.log(`Saved ${outputPath}`);
} finally {
    if (!chrome.killed) chrome.kill();
    const resolvedProfile = resolve(profilePath);
    const resolvedTemp = resolve(tmpdir());
    if (!resolvedProfile.startsWith(`${resolvedTemp}\\`)) {
        throw new Error(`Refusing to remove non-temporary profile: ${resolvedProfile}`);
    }
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
