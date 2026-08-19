# NetworkAdapterManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop app that lists Windows network adapters, lets the user toggle them, edit IP/DNS/proxy, scan/connect Wi-Fi, auto-switch Ethernet↔Wi-Fi, and self-update from GitHub Releases or an offline UNC share — packaged with Inno Setup 7.

**Architecture:** Electron main process (Node.js, runs elevated) shells out to PowerShell for all system interaction and owns the tray/auto-mode/updater logic. Renderer is plain HTML/CSS/JS, talking to main only through a `contextBridge` API in `preload.js`. No UI framework, no native addons, no `electron-updater` (custom updater instead, to stay Inno-Setup-compatible).

**Tech Stack:** Electron, Node.js `child_process` (PowerShell), plain HTML/CSS/JS, Node's built-in `assert` for tests (no test framework), Inno Setup 7, GitHub Releases API.

**Spec:** `docs/superpowers/specs/2026-08-19-adaptermanager-design.md` (mockup: `docs/superpowers/specs/2026-08-19-adaptermanager-mockup.html`)

## Global Constraints

- `nodeIntegration: false`, `contextIsolation: true` on the BrowserWindow — renderer never gets direct Node/child_process access.
- All system interaction goes through PowerShell (`Get-NetAdapter`, `Enable-NetAdapter`/`Disable-NetAdapter`, `Set-DnsClientServerAddress`, `netsh interface ip`, `netsh wlan`) — no native (C++) addon.
- No manual language picker — UI language is derived from `app.getLocale()` at startup, TR or EN, falling back to EN.
- Update mechanism is custom (GitHub Releases API for online, `\\ab30200-0111\BİLGİ İŞLEM\Umut\AdapterManager\Güncellemeler\latest.json` for offline) — do not add `electron-updater`.
- Packaging uses `electron-builder --dir` (directory only, no NSIS target) + a hand-written Inno Setup 7 `installer.iss` with `PrivilegesRequired=admin`.
- GitHub repo: `Fatal-IV/AdapterManager`, public.
- Tests are framework-free: Node's `assert` module, one `test_*.js` per pure-logic module. Anything touching real hardware (actual adapter toggle, real Wi-Fi connect) is a documented manual test step, not an automated one.

---

## Task 1: Project scaffolding & Electron shell

**Files:**
- Create: `package.json`
- Create: `src/main/index.js`
- Create: `src/preload/preload.js`
- Create: `src/renderer/index.html`
- Create: `.gitignore`

**Interfaces:**
- Produces: a running Electron window that loads `src/renderer/index.html`, with `window.api` (currently `{}`) exposed via `contextBridge`.

- [ ] **Step 1: Init npm project and install Electron**

```bash
cd "C:/Users/ab325336/Desktop/IK Browser/AdapterManager"
npm init -y
npm install --save-dev electron@latest electron-builder@latest
```

- [ ] **Step 2: Write `package.json` scripts and metadata**

Edit `package.json` so it contains at least:

```json
{
  "name": "adaptermanager",
  "version": "0.1.0",
  "description": "NetworkAdapterManager",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "test": "node test/run-all.js",
    "pack": "electron-builder --dir"
  },
  "build": {
    "appId": "com.iksoftware.adaptermanager",
    "productName": "NetworkAdapterManager",
    "win": {
      "target": "dir",
      "requestedExecutionLevel": "requireAdmin"
    },
    "directories": { "output": "publish" }
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
publish/
dist/
*.log
```

- [ ] **Step 4: Write `src/main/index.js` — window bootstrap + single instance lock**

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { createWindow };
```

- [ ] **Step 5: Write `src/preload/preload.js` (empty API surface for now)**

```js
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {});
```

- [ ] **Step 6: Write `src/renderer/index.html` (placeholder)**

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>NetworkAdapterManager</title>
</head>
<body>
  <h1>NetworkAdapterManager</h1>
  <p id="status">Yükleniyor…</p>
  <script>
    document.getElementById('status').textContent =
      typeof window.api === 'object' ? 'api köprüsü hazır' : 'api köprüsü YOK';
  </script>
</body>
</html>
```

- [ ] **Step 7: Run the app and verify the window opens**

Run: `npm start`
Expected: a window titled "NetworkAdapterManager" opens showing "api köprüsü hazır". Close it.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore src/
git commit -m "chore: scaffold Electron shell with single-instance lock"
```

---

## Task 2: Adapter listing (PowerShell service + parser + IPC + renderer)

**Files:**
- Create: `src/main/services/powershell.js`
- Create: `src/main/services/adapters.js`
- Create: `test/adapters.test.js`
- Create: `test/run-all.js`
- Modify: `src/main/index.js` (register IPC)
- Modify: `src/preload/preload.js` (expose `adapters.list`)
- Modify: `src/renderer/index.html` (render list)

**Interfaces:**
- Produces: `runPowerShell(script: string): Promise<string>` (raw stdout, from `powershell.js`).
- Produces: `parseAdaptersJson(json: string): Array<{id, name, type, status, mac, ssid}>` (pure function, from `adapters.js`).
- Produces: `listAdapters(): Promise<Array<{id, name, type, status, mac, ssid}>>` (from `adapters.js`).
- Produces: IPC channel `adapters:list` returning the same array.
- Produces: `window.api.adapters.list(): Promise<Array<...>>` in renderer.

- [ ] **Step 1: Write `src/main/services/powershell.js`**

```js
const { execFile } = require('child_process');

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

module.exports = { runPowerShell };
```

- [ ] **Step 2: Write the failing test for `parseAdaptersJson`**

Create `test/adapters.test.js`:

```js
const assert = require('assert');
const { parseAdaptersJson } = require('../src/main/services/adapters');

function test_parses_single_adapter_object() {
  // Get-NetAdapter | ConvertTo-Json returns a bare object (not an array) when there's only one adapter
  const raw = JSON.stringify({
    Name: 'Ethernet',
    InterfaceDescription: 'Realtek PCIe GbE',
    MacAddress: 'A4-83-E7-2C-11-0F',
    Status: 'Up',
    ifIndex: 12
  });
  const result = parseAdaptersJson(raw);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, '12');
  assert.strictEqual(result[0].name, 'Ethernet');
  assert.strictEqual(result[0].mac, 'A4:83:E7:2C:11:0F');
  assert.strictEqual(result[0].status, 'up');
  assert.strictEqual(result[0].type, 'ethernet');
}

function test_parses_multiple_adapters_array() {
  const raw = JSON.stringify([
    { Name: 'Ethernet', InterfaceDescription: 'Realtek PCIe GbE', MacAddress: 'A4-83-E7-2C-11-0F', Status: 'Up', ifIndex: 12 },
    { Name: 'Wi-Fi', InterfaceDescription: 'Intel Wireless-AC', MacAddress: 'C0-18-50-3A-9B-22', Status: 'Disabled', ifIndex: 15 }
  ]);
  const result = parseAdaptersJson(raw);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[1].type, 'wifi');
  assert.strictEqual(result[1].status, 'down');
}

function test_maps_not_present_to_idle_status() {
  const raw = JSON.stringify([
    { Name: 'VPN', InterfaceDescription: 'TAP-Windows Adapter', MacAddress: '00-FF-00-11-22-33', Status: 'NotPresent', ifIndex: 20 }
  ]);
  const result = parseAdaptersJson(raw);
  assert.strictEqual(result[0].status, 'idle');
}

module.exports = {
  test_parses_single_adapter_object,
  test_parses_multiple_adapters_array,
  test_maps_not_present_to_idle_status
};
```

- [ ] **Step 3: Write `test/run-all.js` (tiny runner, no framework)**

```js
const modules = [
  require('./adapters.test.js')
];

let failures = 0;
let count = 0;

for (const mod of modules) {
  for (const [name, fn] of Object.entries(mod)) {
    count++;
    try {
      fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures++;
      console.error(`FAIL - ${name}`);
      console.error(err);
    }
  }
}

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures > 0 ? 1 : 0);
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/services/adapters'` (module doesn't exist yet).

- [ ] **Step 5: Write `src/main/services/adapters.js`**

```js
const { runPowerShell } = require('./powershell');

function macFrom(raw) {
  return (raw || '').replace(/-/g, ':').toUpperCase();
}

function typeFrom(description) {
  const d = (description || '').toLowerCase();
  if (d.includes('wireless') || d.includes('wi-fi') || d.includes('802.11')) return 'wifi';
  return 'ethernet';
}

function statusFrom(raw) {
  switch (raw) {
    case 'Up': return 'up';
    case 'Disabled': return 'down';
    default: return 'idle';
  }
}

function parseAdaptersJson(json) {
  const parsed = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((a) => ({
    id: String(a.ifIndex),
    name: a.Name,
    type: typeFrom(a.InterfaceDescription),
    status: statusFrom(a.Status),
    mac: macFrom(a.MacAddress)
  }));
}

async function listAdapters() {
  const json = await runPowerShell(
    'Get-NetAdapter | Select-Object Name,InterfaceDescription,MacAddress,Status,ifIndex | ConvertTo-Json -Compress'
  );
  if (!json) return [];
  return parseAdaptersJson(json);
}

module.exports = { parseAdaptersJson, listAdapters };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node test/run-all.js`
Expected: `3/3 passed`

- [ ] **Step 7: Register the `adapters:list` IPC handler in `src/main/index.js`**

Add near the top (after requires) and before `app.whenReady()`:

```js
const { ipcMain } = require('electron');
const { listAdapters } = require('./services/adapters');

ipcMain.handle('adapters:list', async () => {
  return listAdapters();
});
```

- [ ] **Step 8: Expose it in `src/preload/preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  adapters: {
    list: () => ipcRenderer.invoke('adapters:list')
  }
});
```

- [ ] **Step 9: Render the raw list in `src/renderer/index.html`**

Replace the `<script>` block with:

```html
<script>
  window.api.adapters.list().then((adapters) => {
    document.getElementById('status').textContent =
      adapters.map(a => `${a.name} (${a.status})`).join(', ') || 'Adaptör bulunamadı';
  });
</script>
```

- [ ] **Step 10: Run the app as Administrator and verify real adapters show up**

Run: `npm start` (from an elevated terminal — `Get-NetAdapter` needs no admin, but later tasks will)
Expected: the page shows your real adapter names and statuses (e.g. "Ethernet (up), Wi-Fi (down)").

- [ ] **Step 11: Commit**

```bash
git add src/ test/ package.json
git commit -m "feat: list network adapters via PowerShell"
```

---

## Task 3: Adapter toggle (enable/disable) end-to-end

**Files:**
- Modify: `src/main/services/adapters.js`
- Modify: `test/adapters.test.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`
- Modify: `src/renderer/index.html`

**Interfaces:**
- Consumes: `runPowerShell` from Task 2.
- Produces: `toggleAdapter(id: string, enable: boolean): Promise<void>` in `adapters.js`.
- Produces: IPC channel `adapters:toggle` (args: `{ id, enable }`).
- Produces: `window.api.adapters.toggle(id, enable): Promise<void>`.

- [ ] **Step 1: Write the failing test for the PowerShell command builder**

Add to `test/adapters.test.js` (and to the `module.exports` list at the bottom):

```js
const { buildToggleCommand } = require('../src/main/services/adapters');

function test_builds_enable_command() {
  const cmd = buildToggleCommand('12', true);
  assert.strictEqual(cmd, "Enable-NetAdapter -InterfaceIndex 12 -Confirm:$false");
}

function test_builds_disable_command() {
  const cmd = buildToggleCommand('15', false);
  assert.strictEqual(cmd, "Disable-NetAdapter -InterfaceIndex 15 -Confirm:$false");
}
```

Add `test_builds_enable_command, test_builds_disable_command` to the exports object.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `buildToggleCommand is not a function`.

- [ ] **Step 3: Implement `buildToggleCommand` and `toggleAdapter` in `src/main/services/adapters.js`**

Add before `module.exports`:

```js
function buildToggleCommand(id, enable) {
  const verb = enable ? 'Enable-NetAdapter' : 'Disable-NetAdapter';
  return `${verb} -InterfaceIndex ${id} -Confirm:$false`;
}

async function toggleAdapter(id, enable) {
  await runPowerShell(buildToggleCommand(id, enable));
}
```

Update the `module.exports` line:

```js
module.exports = { parseAdaptersJson, listAdapters, buildToggleCommand, toggleAdapter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `5/5 passed`

- [ ] **Step 5: Register `adapters:toggle` IPC handler in `src/main/index.js`**

```js
const { toggleAdapter } = require('./services/adapters');
// (extend the existing destructure from './services/adapters' instead of a second require)

ipcMain.handle('adapters:toggle', async (_event, { id, enable }) => {
  await toggleAdapter(id, enable);
  return listAdapters();
});
```

- [ ] **Step 6: Expose in `src/preload/preload.js`**

```js
adapters: {
  list: () => ipcRenderer.invoke('adapters:list'),
  toggle: (id, enable) => ipcRenderer.invoke('adapters:toggle', { id, enable })
}
```

- [ ] **Step 7: Wire a toggle button in `src/renderer/index.html`**

Replace the `<script>` block:

```html
<script>
  async function render() {
    const adapters = await window.api.adapters.list();
    const el = document.getElementById('status');
    el.innerHTML = '';
    adapters.forEach((a) => {
      const row = document.createElement('div');
      const btn = document.createElement('button');
      btn.textContent = a.status === 'down' ? 'Etkinleştir' : 'Devre Dışı Bırak';
      btn.onclick = async () => {
        await window.api.adapters.toggle(a.id, a.status === 'down');
        render();
      };
      row.textContent = `${a.name} (${a.status}) `;
      row.appendChild(btn);
      el.appendChild(row);
    });
  }
  render();
</script>
```

- [ ] **Step 8: Manual test — run elevated and toggle a real adapter**

Run: launch an elevated terminal, `npm start`. Click "Devre Dışı Bırak" on a non-critical adapter (e.g. Wi-Fi), confirm in Windows' own network settings that it went down, click again to re-enable.
Expected: adapter state actually changes and the list re-renders with the new status.

- [ ] **Step 9: Commit**

```bash
git add src/ test/
git commit -m "feat: enable/disable adapters from the UI"
```

---

## Task 4: IP/DNS view & edit end-to-end

**Files:**
- Create: `src/main/services/network.js`
- Create: `test/network.test.js`
- Modify: `test/run-all.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`

**Interfaces:**
- Consumes: `runPowerShell` from Task 2.
- Produces: `parseIpConfig(raw: string): {dhcp: boolean, ip: string, subnet: string, gateway: string, dns: string[]}` (pure).
- Produces: `getIpConfig(id: string): Promise<{dhcp, ip, subnet, gateway, dns}>`.
- Produces: `setIpConfig(id: string, config: {dhcp: boolean, ip?, subnet?, gateway?, dns?: string[]}): Promise<void>`.
- Produces: IPC channels `network:getIp`, `network:setIp`.
- Produces: `window.api.network.getIp(id)`, `window.api.network.setIp(id, config)`.

- [ ] **Step 1: Write the failing test for `parseIpConfig`**

Create `test/network.test.js`:

```js
const assert = require('assert');
const { parseIpConfig } = require('../src/main/services/network');

function test_parses_dhcp_enabled_config() {
  const raw = [
    'DHCP enabled:                        Yes',
    'IPv4 Address:                        192.168.1.42(Preferred)',
    'Subnet Prefix:                       192.168.1.0/24 (mask 255.255.255.0)',
    'Default Gateway:                     192.168.1.1',
    'DNS Servers:                         8.8.8.8',
    '                                     8.8.4.4'
  ].join('\r\n');
  const cfg = parseIpConfig(raw);
  assert.strictEqual(cfg.dhcp, true);
  assert.strictEqual(cfg.ip, '192.168.1.42');
  assert.strictEqual(cfg.subnet, '255.255.255.0');
  assert.strictEqual(cfg.gateway, '192.168.1.1');
  assert.deepStrictEqual(cfg.dns, ['8.8.8.8', '8.8.4.4']);
}

function test_parses_dhcp_disabled_config() {
  const raw = [
    'DHCP enabled:                        No',
    'IPv4 Address:                        10.0.0.5(Preferred)',
    'Subnet Prefix:                       10.0.0.0/24 (mask 255.255.255.0)',
    'Default Gateway:                     10.0.0.1',
    'DNS Servers:                         1.1.1.1'
  ].join('\r\n');
  const cfg = parseIpConfig(raw);
  assert.strictEqual(cfg.dhcp, false);
  assert.deepStrictEqual(cfg.dns, ['1.1.1.1']);
}

module.exports = { test_parses_dhcp_enabled_config, test_parses_dhcp_disabled_config };
```

- [ ] **Step 2: Register the new test module in `test/run-all.js`**

```js
const modules = [
  require('./adapters.test.js'),
  require('./network.test.js')
];
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/services/network'`.

- [ ] **Step 4: Write `src/main/services/network.js`**

```js
const { runPowerShell } = require('./powershell');

function parseIpConfig(raw) {
  const lines = raw.split(/\r?\n/);
  const dhcp = /DHCP enabled:\s*Yes/i.test(raw);
  const ip = (raw.match(/IPv4 Address:\s*([\d.]+)/i) || [])[1] || '';
  const subnetLine = raw.match(/Subnet Prefix:.*mask ([\d.]+)/i);
  const subnet = subnetLine ? subnetLine[1] : '';
  const gateway = (raw.match(/Default Gateway:\s*([\d.]+)/i) || [])[1] || '';

  const dns = [];
  let inDnsBlock = false;
  for (const line of lines) {
    if (/DNS Servers:/i.test(line)) {
      inDnsBlock = true;
      const first = line.match(/DNS Servers:\s*([\d.]+)/i);
      if (first) dns.push(first[1]);
      continue;
    }
    if (inDnsBlock) {
      const m = line.match(/^\s*([\d.]+)\s*$/);
      if (m) {
        dns.push(m[1]);
      } else {
        inDnsBlock = false;
      }
    }
  }

  return { dhcp, ip, subnet, gateway, dns };
}

async function getIpConfig(id) {
  const raw = await runPowerShell(`netsh interface ip show config name="${id}"`);
  return parseIpConfig(raw);
}

function maskToPrefixLength(mask) {
  return mask.split('.').reduce((bits, octet) => bits + (parseInt(octet, 10).toString(2).match(/1/g) || []).length, 0);
}

async function setIpConfig(id, config) {
  if (config.dhcp) {
    await runPowerShell(`netsh interface ip set address name="${id}" source=dhcp`);
    await runPowerShell(`netsh interface ip set dns name="${id}" source=dhcp`);
    return;
  }
  const prefix = maskToPrefixLength(config.subnet);
  await runPowerShell(
    `netsh interface ip set address name="${id}" static ${config.ip} ${config.subnet} ${config.gateway}`
  );
  const dns = config.dns || [];
  if (dns[0]) {
    await runPowerShell(`netsh interface ip set dns name="${id}" static ${dns[0]} primary`);
  }
  if (dns[1]) {
    await runPowerShell(`netsh interface ip add dns name="${id}" ${dns[1]} index=2`);
  }
}

module.exports = { parseIpConfig, getIpConfig, setIpConfig, maskToPrefixLength };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `7/7 passed`

- [ ] **Step 6: Register IPC handlers in `src/main/index.js`**

```js
const { getIpConfig, setIpConfig } = require('./services/network');

ipcMain.handle('network:getIp', async (_event, id) => getIpConfig(id));
ipcMain.handle('network:setIp', async (_event, { id, config }) => {
  await setIpConfig(id, config);
  return getIpConfig(id);
});
```

Note: `getIpConfig`/`setIpConfig` take the adapter **name** (e.g. `"Wi-Fi"`), not the `ifIndex` used by toggle — `netsh` addresses interfaces by name. Renderer must pass `a.name`, not `a.id`, for these two calls.

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
network: {
  getIp: (name) => ipcRenderer.invoke('network:getIp', name),
  setIp: (name, config) => ipcRenderer.invoke('network:setIp', { id: name, config })
}
```

- [ ] **Step 8: Manual test — read and set real IP config**

Run: elevated `npm start`, open Node REPL or a temporary renderer button wired to `window.api.network.getIp('Ethernet')` and log the result to devtools console.
Expected: returns your actual DHCP/IP/gateway/DNS. (Full UI wiring happens in Task 7 — this task only proves the service layer works end-to-end.)

- [ ] **Step 9: Commit**

```bash
git add src/ test/
git commit -m "feat: read and set adapter IP/DNS configuration"
```

---

## Task 5: Proxy view & edit end-to-end

**Files:**
- Modify: `src/main/services/network.js`
- Modify: `test/network.test.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`

**Interfaces:**
- Produces: `parseProxyConfig(regOutput: string): {mode: 'off'|'auto'|'manual', server: string, autoConfigUrl: string}` (pure).
- Produces: `getProxyConfig(): Promise<{mode, server, autoConfigUrl}>`.
- Produces: `setProxyConfig(config: {mode, server?, autoConfigUrl?}): Promise<void>`.
- Produces: IPC channels `network:getProxy`, `network:setProxy`.
- Produces: `window.api.network.getProxy()`, `window.api.network.setProxy(config)`.

- [ ] **Step 1: Write the failing test for `parseProxyConfig`**

Add to `test/network.test.js` (and its exports):

```js
const { parseProxyConfig } = require('../src/main/services/network');

function test_parses_manual_proxy_enabled() {
  const raw = [
    'ProxyEnable    REG_DWORD    0x1',
    'ProxyServer    REG_SZ    127.0.0.1:8080'
  ].join('\r\n');
  const cfg = parseProxyConfig(raw);
  assert.strictEqual(cfg.mode, 'manual');
  assert.strictEqual(cfg.server, '127.0.0.1:8080');
}

function test_parses_auto_config_script() {
  const raw = [
    'ProxyEnable    REG_DWORD    0x0',
    'AutoConfigURL    REG_SZ    http://proxy.local/proxy.pac'
  ].join('\r\n');
  const cfg = parseProxyConfig(raw);
  assert.strictEqual(cfg.mode, 'auto');
  assert.strictEqual(cfg.autoConfigUrl, 'http://proxy.local/proxy.pac');
}

function test_parses_proxy_off() {
  const raw = 'ProxyEnable    REG_DWORD    0x0';
  const cfg = parseProxyConfig(raw);
  assert.strictEqual(cfg.mode, 'off');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `parseProxyConfig is not a function`.

- [ ] **Step 3: Implement in `src/main/services/network.js`**

Add before `module.exports`:

```js
const PROXY_REG_PATH = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

function parseProxyConfig(raw) {
  const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(raw);
  const server = (raw.match(/ProxyServer\s+REG_SZ\s+(\S+)/i) || [])[1] || '';
  const autoConfigUrl = (raw.match(/AutoConfigURL\s+REG_SZ\s+(\S+)/i) || [])[1] || '';
  if (autoConfigUrl) return { mode: 'auto', server: '', autoConfigUrl };
  if (enabled) return { mode: 'manual', server, autoConfigUrl: '' };
  return { mode: 'off', server: '', autoConfigUrl: '' };
}

async function getProxyConfig() {
  const raw = await runPowerShell(`Get-ItemProperty -Path "${PROXY_REG_PATH}" | Format-List *`);
  return parseProxyConfig(raw);
}

async function setProxyConfig(config) {
  if (config.mode === 'off') {
    await runPowerShell(`Set-ItemProperty -Path "${PROXY_REG_PATH}" -Name ProxyEnable -Value 0`);
    await runPowerShell(`Remove-ItemProperty -Path "${PROXY_REG_PATH}" -Name AutoConfigURL -ErrorAction SilentlyContinue`);
  } else if (config.mode === 'manual') {
    await runPowerShell(`Set-ItemProperty -Path "${PROXY_REG_PATH}" -Name ProxyEnable -Value 1`);
    await runPowerShell(`Set-ItemProperty -Path "${PROXY_REG_PATH}" -Name ProxyServer -Value "${config.server}"`);
  } else if (config.mode === 'auto') {
    await runPowerShell(`Set-ItemProperty -Path "${PROXY_REG_PATH}" -Name ProxyEnable -Value 0`);
    await runPowerShell(`Set-ItemProperty -Path "${PROXY_REG_PATH}" -Name AutoConfigURL -Value "${config.autoConfigUrl}"`);
  }
}

module.exports = {
  parseIpConfig, getIpConfig, setIpConfig, maskToPrefixLength,
  parseProxyConfig, getProxyConfig, setProxyConfig
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `10/10 passed`

- [ ] **Step 5: Register IPC handlers in `src/main/index.js`**

```js
const { getProxyConfig, setProxyConfig } = require('./services/network');

ipcMain.handle('network:getProxy', async () => getProxyConfig());
ipcMain.handle('network:setProxy', async (_event, config) => {
  await setProxyConfig(config);
  return getProxyConfig();
});
```

- [ ] **Step 6: Expose in `src/preload/preload.js`**

```js
getProxy: () => ipcRenderer.invoke('network:getProxy'),
setProxy: (config) => ipcRenderer.invoke('network:setProxy', config)
```
(add these two lines inside the existing `network: { ... }` object from Task 4)

- [ ] **Step 7: Manual test**

Run: elevated `npm start`, call `window.api.network.getProxy()` from devtools console, compare against Windows Settings → Network & Internet → Proxy.
Expected: matches.

- [ ] **Step 8: Commit**

```bash
git add src/ test/
git commit -m "feat: read and set system proxy configuration"
```

---

## Task 6: Wi-Fi scan & connect end-to-end

**Files:**
- Create: `src/main/services/wifi.js`
- Create: `test/wifi.test.js`
- Modify: `test/run-all.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`

**Interfaces:**
- Produces: `parseWifiScan(raw: string): Array<{ssid: string, signal: number, secured: boolean, connected: boolean}>` (pure).
- Produces: `scanWifi(): Promise<Array<{ssid, signal, secured, connected}>>`.
- Produces: `connectWifi(ssid: string, password: string): Promise<void>`.
- Produces: IPC channels `wifi:scan`, `wifi:connect`.
- Produces: `window.api.wifi.scan()`, `window.api.wifi.connect(ssid, password)`.

- [ ] **Step 1: Write the failing test for `parseWifiScan`**

Create `test/wifi.test.js`:

```js
const assert = require('assert');
const { parseWifiScan } = require('../src/main/services/wifi');

const SAMPLE = `
SSID 1 : Ofis-LAN-5G
    Network type            : Infrastructure
    Authentication          : WPA2-Personal
    Encryption               : CCMP
    BSSID 1                  : aa:bb:cc:dd:ee:ff
         Signal              : 92%

SSID 2 : Misafir-WiFi
    Network type            : Infrastructure
    Authentication          : Open
    Encryption               : None
    BSSID 1                  : 11:22:33:44:55:66
         Signal              : 61%
`;

function test_parses_secured_and_open_networks() {
  const result = parseWifiScan(SAMPLE, 'Ofis-LAN-5G');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].ssid, 'Ofis-LAN-5G');
  assert.strictEqual(result[0].secured, true);
  assert.strictEqual(result[0].signal, 92);
  assert.strictEqual(result[0].connected, true);
  assert.strictEqual(result[1].ssid, 'Misafir-WiFi');
  assert.strictEqual(result[1].secured, false);
  assert.strictEqual(result[1].connected, false);
}

module.exports = { test_parses_secured_and_open_networks };
```

- [ ] **Step 2: Register in `test/run-all.js`**

```js
const modules = [
  require('./adapters.test.js'),
  require('./network.test.js'),
  require('./wifi.test.js')
];
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/services/wifi'`.

- [ ] **Step 4: Write `src/main/services/wifi.js`**

```js
const { runPowerShell } = require('./powershell');

function parseWifiScan(raw, connectedSsid) {
  const blocks = raw.split(/\r?\nSSID \d+ : /).slice(1);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const ssid = lines[0].trim();
    const auth = (block.match(/Authentication\s*:\s*(.+)/i) || [])[1] || '';
    const signal = parseInt((block.match(/Signal\s*:\s*(\d+)%/i) || [])[1] || '0', 10);
    return {
      ssid,
      signal,
      secured: !/open/i.test(auth.trim()),
      connected: ssid === connectedSsid
    };
  });
}

async function getConnectedSsid() {
  const raw = await runPowerShell('(netsh wlan show interfaces) -match "^\\s*SSID"');
  const m = raw.match(/SSID\s*:\s*(.+)/i);
  return m ? m[1].trim() : '';
}

async function scanWifi() {
  await runPowerShell('netsh wlan disconnect | Out-Null; netsh wlan connect ssid=nonexistent name=nonexistent 2>$null | Out-Null');
  const raw = await runPowerShell('netsh wlan show networks mode=Bssid');
  const connected = await getConnectedSsid();
  return parseWifiScan(raw, connected);
}

async function connectWifi(ssid, password) {
  const profileXml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${ssid}</name>
  <SSIDConfig><SSID><name>${ssid}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security>
    <authEncryption>
      <authentication>WPA2PSK</authentication>
      <encryption>AES</encryption>
      <useOneX>false</useOneX>
    </authEncryption>
    <sharedKey>
      <keyType>passPhrase</keyType>
      <protected>false</protected>
      <keyMaterial>${password}</keyMaterial>
    </sharedKey>
  </security></MSM>
</WLANProfile>`;
  const tempPath = `$env:TEMP\\adaptermanager-wifi-profile.xml`;
  await runPowerShell(`@'\n${profileXml}\n'@ | Out-File -Encoding utf8 ${tempPath}`);
  await runPowerShell(`netsh wlan add profile filename="${tempPath}"`);
  await runPowerShell(`netsh wlan connect name="${ssid}" ssid="${ssid}"`);
}

module.exports = { parseWifiScan, scanWifi, connectWifi, getConnectedSsid };
```

**Note for the implementer:** the "force a rescan" line in `scanWifi` (disconnect + connect-to-nonexistent) is a known `netsh wlan` quirk to force Windows to refresh its scan cache before `show networks` — verify on your test machine and simplify to a plain `netsh wlan show networks mode=Bssid` if it turns out unnecessary on your Windows build.

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `11/11 passed`

- [ ] **Step 6: Register IPC handlers in `src/main/index.js`**

```js
const { scanWifi, connectWifi } = require('./services/wifi');

ipcMain.handle('wifi:scan', async () => scanWifi());
ipcMain.handle('wifi:connect', async (_event, { ssid, password }) => {
  await connectWifi(ssid, password);
});
```

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
wifi: {
  scan: () => ipcRenderer.invoke('wifi:scan'),
  connect: (ssid, password) => ipcRenderer.invoke('wifi:connect', { ssid, password })
}
```

- [ ] **Step 8: Manual test**

Run: elevated `npm start`, call `window.api.wifi.scan()` from devtools console.
Expected: returns the real list of nearby SSIDs matching what Windows' own Wi-Fi panel shows. Test `connect` against a real network you control.

- [ ] **Step 9: Commit**

```bash
git add src/ test/
git commit -m "feat: scan and connect to Wi-Fi networks"
```

---

## Task 7: Apply the approved mockup UI (main screen, sidebar, detail sheet) with real data

**Files:**
- Modify: `src/renderer/index.html`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/app.js`
- Reference (read-only, source of visual truth): `docs/superpowers/specs/2026-08-19-adaptermanager-mockup.html`

**Interfaces:**
- Consumes: `window.api.adapters.list/toggle`, `window.api.network.getIp/setIp/getProxy/setProxy`, `window.api.wifi.scan/connect` (all from Tasks 2–6).
- Produces: `renderAdapterList(adapters)`, `openDetailSheet(adapter)`, `closeDetailSheet()`, `openDrawer()`, `closeDrawer()`, `filterAdapters(query, statusFilter)` — all in `app.js`, used by later tasks (Auto Mode card wiring in Task 10).

- [ ] **Step 1: Split the mockup into `index.html` + `styles.css`**

Copy `docs/superpowers/specs/2026-08-19-adaptermanager-mockup.html`:
- Everything inside the `<style>` block → new file `src/renderer/styles.css` (drop the `<style>`/`</style>` tags themselves).
- The HTML body (everything from `<div class="app">` through the closing `</div>` of `.sheet`, plus the `.drawer` and scrim `<div>`s) → the `<body>` of `src/renderer/index.html`.
- Drop the mockup's inline `<script>` block entirely — its logic is rewritten in `app.js` below.

`src/renderer/index.html` becomes:

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>NetworkAdapterManager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- paste the mockup's .app / .drawer / .scrim / .sheet markup here, unchanged -->
  <script src="app.js"></script>
</body>
</html>
```

Two markup changes while pasting:
- Delete the two hardcoded `.adapter-card` blocks inside `<div class="adapter-list">` — `app.js` renders these dynamically.
- Delete the three hardcoded `.drawer-row` blocks inside `<div class="drawer-list">` — same reason.
- Leave `#scrim`, `#drawerScrim`, `#sheet`, `#drawer`, `#tabs`, `.sheet-body`, `#sheetGlyph`, `#sheetTitle`, `#sheetSub` ids exactly as in the mockup — `app.js` targets them by id.

- [ ] **Step 2: Write `src/renderer/app.js` — icon/status helpers and card rendering**

```js
const GLYPHS = {
  ethernet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h1M15 7V4a1 1 0 0 0-1-1h-1"/><path d="M7 17v2M17 17v2"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a11 11 0 0 1 14 0"/><path d="M8.2 16a6.5 6.5 0 0 1 7.6 0"/><path d="M11.5 19.5h1"/></svg>'
};

let currentAdapters = [];
let activeSheetAdapter = null;

function statusLabel(status) {
  if (status === 'up') return 'Bağlı';
  if (status === 'down') return 'Devre dışı';
  return 'Bağlı değil';
}

function buildAdapterCard(adapter, { compact }) {
  const el = document.createElement('div');
  el.className = compact ? 'drawer-row' : 'adapter-card';
  el.dataset.status = adapter.status;
  el.onclick = () => {
    openDetailSheet(adapter);
    if (compact) closeDrawer();
  };

  const glyph = document.createElement('div');
  glyph.className = 'adapter-glyph';
  glyph.dataset.status = adapter.status;
  glyph.innerHTML = GLYPHS[adapter.type] || GLYPHS.ethernet;
  el.appendChild(glyph);

  const info = document.createElement('div');
  info.className = compact ? 'drawer-row-info' : 'adapter-info';
  const nameRow = document.createElement('div');
  nameRow.className = compact ? 'drawer-row-name' : 'adapter-name-row';
  nameRow.innerHTML = `<span class="${compact ? '' : 'adapter-name'}">${adapter.name}</span>`;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  nameRow.appendChild(dot);
  info.appendChild(nameRow);

  const meta = document.createElement('div');
  meta.className = compact ? 'drawer-row-meta' : 'adapter-meta';
  meta.innerHTML = `<span>${statusLabel(adapter.status)}</span>${compact ? '' : `<span>${adapter.mac}</span>`}`;
  info.appendChild(meta);
  el.appendChild(info);

  if (!compact) {
    const toggle = document.createElement('button');
    toggle.className = 'switch';
    toggle.dataset.on = String(adapter.status === 'up');
    toggle.onclick = async (ev) => {
      ev.stopPropagation();
      await window.api.adapters.toggle(adapter.id, adapter.status !== 'up');
      await refreshAdapters();
    };
    el.appendChild(toggle);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    el.appendChild(chevron);
  }

  return el;
}

function renderAdapterList(adapters) {
  const list = document.querySelector('.adapter-list');
  list.innerHTML = '';
  adapters.forEach((a) => list.appendChild(buildAdapterCard(a, { compact: false })));

  const drawerList = document.querySelector('.drawer-list');
  drawerList.innerHTML = '';
  adapters.forEach((a) => drawerList.appendChild(buildAdapterCard(a, { compact: true })));
}

function filterAdapters(query, statusFilter) {
  const q = (query || '').toLowerCase();
  return currentAdapters.filter((a) => {
    const matchesQuery = a.name.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && a.status === 'up') ||
      (statusFilter === 'inactive' && a.status !== 'up');
    return matchesQuery && matchesStatus;
  });
}

async function refreshAdapters() {
  currentAdapters = await window.api.adapters.list();
  renderAdapterList(currentAdapters);
}

module.exports = typeof module !== 'undefined' ? { filterAdapters } : undefined;
```

- [ ] **Step 3: Add the detail sheet logic (IP/DNS, Proxy, Wi-Fi tabs) to `app.js`**

Append to `app.js`:

```js
function fillIpPanel(cfg) {
  document.querySelector('.panel[data-panel="ip"] .segmented button[data-mode="dhcp"]')
    .classList.toggle('active', cfg.dhcp);
  document.querySelector('.panel[data-panel="ip"] .segmented button[data-mode="manual"]')
    .classList.toggle('active', !cfg.dhcp);
  const inputs = document.querySelectorAll('.panel[data-panel="ip"] input');
  inputs[0].value = cfg.ip || '';
  inputs[1].value = cfg.subnet || '';
  inputs[2].value = cfg.gateway || '';
  inputs[3].value = (cfg.dns && cfg.dns[0]) || '';
  inputs[4].value = (cfg.dns && cfg.dns[1]) || '';
}

function fillProxyPanel(cfg) {
  document.querySelectorAll('.panel[data-panel="proxy"] .segmented button').forEach((b) => b.classList.remove('active'));
  const map = { off: 'proxy-off', auto: 'proxy-auto', manual: 'proxy-manual' };
  document.querySelector(`.panel[data-panel="proxy"] .segmented button[data-mode="${map[cfg.mode]}"]`)
    .classList.add('active');
  document.querySelector('.panel[data-panel="proxy"] input').value = cfg.autoConfigUrl || cfg.server || '';
}

async function fillWifiPanel(adapter) {
  const list = document.querySelector('.wifi-list');
  list.innerHTML = '<p>Taranıyor…</p>';
  const networks = await window.api.wifi.scan();
  list.innerHTML = '';
  networks.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'wifi-row' + (n.connected ? ' connected' : '');
    row.innerHTML = `<span class="name">${n.ssid}</span>${n.connected ? '<span class="connected-tag">Bağlı</span>' : ''}`;
    row.onclick = async () => {
      if (n.connected) return;
      const password = window.prompt(`"${n.ssid}" için şifre:`);
      if (password === null) return;
      await window.api.wifi.connect(n.ssid, password);
      fillWifiPanel(adapter);
    };
    list.appendChild(row);
  });
}

async function openDetailSheet(adapter) {
  activeSheetAdapter = adapter;
  document.getElementById('sheetGlyph').innerHTML = GLYPHS[adapter.type] || GLYPHS.ethernet;
  document.getElementById('sheetTitle').textContent = adapter.name;
  document.getElementById('sheetSub').textContent = adapter.mac;

  const tabs = document.getElementById('tabs');
  const isWifi = adapter.type === 'wifi';
  tabs.style.display = 'flex';
  document.querySelector('.tabs-line').style.display = 'block';
  tabs.querySelector('.tab[data-panel="wifi"]').style.display = isWifi ? '' : 'none';

  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === 'ip'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === 'ip'));

  const [ipCfg, proxyCfg] = await Promise.all([
    window.api.network.getIp(adapter.name),
    window.api.network.getProxy()
  ]);
  fillIpPanel(ipCfg);
  fillProxyPanel(proxyCfg);

  document.getElementById('sheet').classList.add('open');
  document.getElementById('scrim').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheet').classList.remove('open');
  document.getElementById('scrim').classList.remove('open');
  activeSheetAdapter = null;
}

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerScrim').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerScrim').classList.remove('open');
}
```

- [ ] **Step 4: Wire tab clicks (including lazy Wi-Fi scan) and static button listeners**

Append to `app.js`:

```js
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.panel[data-panel="${tab.dataset.panel}"]`).classList.add('active');
      if (tab.dataset.panel === 'wifi' && activeSheetAdapter) fillWifiPanel(activeSheetAdapter);
    });
  });

  document.querySelector('.sheet-close').addEventListener('click', closeSheet);
  document.getElementById('scrim').addEventListener('click', closeSheet);
  document.querySelector('.icon-btn[title="Menü"]').addEventListener('click', openDrawer);
  document.getElementById('drawerScrim').addEventListener('click', closeDrawer);
  document.querySelector('.drawer .icon-btn').addEventListener('click', closeDrawer);

  const searchInput = document.querySelector('.search-box input');
  const filterButtons = document.querySelectorAll('.drawer .segmented button');
  function applyDrawerFilter() {
    const active = document.querySelector('.drawer .segmented button.active');
    const filtered = filterAdapters(searchInput.value, active.dataset.filter);
    const drawerList = document.querySelector('.drawer-list');
    drawerList.innerHTML = '';
    filtered.forEach((a) => drawerList.appendChild(buildAdapterCard(a, { compact: true })));
  }
  searchInput.addEventListener('input', applyDrawerFilter);
  filterButtons.forEach((btn) => btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyDrawerFilter();
  }));

  refreshAdapters();
});
```

- [ ] **Step 5: Remove the Node-only `module.exports` line from Step 2**

`app.js` runs only in the renderer (browser context, no `module` global) — delete this line entirely from the file:

```js
module.exports = typeof module !== 'undefined' ? { filterAdapters } : undefined;
```

- [ ] **Step 6: Run the app and manually verify the full UI**

Run: elevated `npm start`.
Expected: main screen matches the mockup (Otomatik Mod card is still static — Task 10 wires it up), real adapters listed with working toggle, hamburger opens the sidebar with working search/filter, clicking any adapter opens the detail sheet with real IP/DNS/Proxy values, Wi-Fi tab (only on the Wi-Fi adapter) scans and lists real networks.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/
git commit -m "feat: wire the approved mockup UI to live adapter data"
```

---

## Task 8: i18n — automatic system-locale TR/EN

**Files:**
- Create: `src/renderer/i18n/tr.json`
- Create: `src/renderer/i18n/en.json`
- Create: `src/renderer/i18n.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`
- Modify: `src/renderer/index.html` (add `data-i18n` attributes)
- Modify: `src/renderer/app.js` (translate dynamically-built strings)
- Create: `test/i18n.test.js`
- Modify: `test/run-all.js`

**Interfaces:**
- Produces: `resolveLocale(systemLocale: string): 'tr'|'en'` (pure, in `i18n.js`... actually computed in main and shipped via IPC — see Step 3).
- Produces: IPC channel `app:locale` → `'tr'|'en'`.
- Produces: `window.api.locale: 'tr'|'en'` (fetched once at preload time via `ipcRenderer.sendSync` — simplest correct approach for a value needed before first paint).
- Produces: `t(key: string): string` global helper in renderer, and `applyI18n()` that fills every `[data-i18n]` element's `textContent`.

- [ ] **Step 1: Write the failing test for locale resolution**

Create `test/i18n.test.js`:

```js
const assert = require('assert');
const { resolveLocale } = require('../src/main/services/i18n');

function test_turkish_locale_maps_to_tr() {
  assert.strictEqual(resolveLocale('tr-TR'), 'tr');
  assert.strictEqual(resolveLocale('tr'), 'tr');
}

function test_other_locales_fall_back_to_en() {
  assert.strictEqual(resolveLocale('de-DE'), 'en');
  assert.strictEqual(resolveLocale('en-US'), 'en');
  assert.strictEqual(resolveLocale(''), 'en');
}

module.exports = { test_turkish_locale_maps_to_tr, test_other_locales_fall_back_to_en };
```

- [ ] **Step 2: Register in `test/run-all.js`**

```js
const modules = [
  require('./adapters.test.js'),
  require('./network.test.js'),
  require('./wifi.test.js'),
  require('./i18n.test.js')
];
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/services/i18n'`.

- [ ] **Step 4: Write `src/main/services/i18n.js`**

```js
function resolveLocale(systemLocale) {
  return (systemLocale || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

module.exports = { resolveLocale };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `13/13 passed`

- [ ] **Step 6: Wire locale resolution into `src/main/index.js` and expose synchronously**

```js
const { resolveLocale } = require('./services/i18n');

ipcMain.on('app:locale', (event) => {
  event.returnValue = resolveLocale(app.getLocale());
});
```

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
const locale = ipcRenderer.sendSync('app:locale');

contextBridge.exposeInMainWorld('api', {
  locale,
  // ...existing adapters/network/wifi entries stay unchanged
});
```

- [ ] **Step 8: Write the translation dictionaries**

Create `src/renderer/i18n/tr.json`:

```json
{
  "app.title": "NetworkAdapterManager",
  "auto.title": "Otomatik Mod",
  "auto.subtitle": "Ethernet bağlandığında Wi-Fi otomatik olarak kapanır",
  "section.adapters": "Adaptörler",
  "status.up": "Bağlı",
  "status.down": "Devre dışı",
  "status.idle": "Bağlı değil",
  "drawer.title": "Adaptörler",
  "drawer.search": "Adaptör ara…",
  "filter.all": "Tümü",
  "filter.active": "Aktif",
  "filter.inactive": "Pasif",
  "tab.ip": "IP / DNS",
  "tab.proxy": "Proxy",
  "tab.wifi": "Ağlar",
  "wifi.scan": "Ağları Tara",
  "wifi.connected": "Bağlı",
  "footer.adminNotice": "Yönetici olarak çalışıyor"
}
```

Create `src/renderer/i18n/en.json`:

```json
{
  "app.title": "NetworkAdapterManager",
  "auto.title": "Auto Mode",
  "auto.subtitle": "Wi-Fi turns off automatically when Ethernet connects",
  "section.adapters": "Adapters",
  "status.up": "Connected",
  "status.down": "Disabled",
  "status.idle": "Not connected",
  "drawer.title": "Adapters",
  "drawer.search": "Search adapters…",
  "filter.all": "All",
  "filter.active": "Active",
  "filter.inactive": "Inactive",
  "tab.ip": "IP / DNS",
  "tab.proxy": "Proxy",
  "tab.wifi": "Networks",
  "wifi.scan": "Scan Networks",
  "wifi.connected": "Connected",
  "footer.adminNotice": "Running as Administrator"
}
```

- [ ] **Step 9: Write `src/renderer/i18n.js`**

```js
let dict = {};

async function loadI18n() {
  const res = await fetch(`i18n/${window.api.locale}.json`);
  dict = await res.json();
}

function t(key) {
  return dict[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
```

- [ ] **Step 10: Tag static strings in `index.html` and load i18n before first render in `app.js`**

In `index.html`, add `data-i18n` attributes to the static labels, e.g.:

```html
<span data-i18n="app.title">NetworkAdapterManager</span>
...
<h3 data-i18n="auto.title">Otomatik Mod</h3>
<p data-i18n="auto.subtitle">Ethernet bağlandığında Wi-Fi otomatik olarak kapanır</p>
...
<div class="section-label" data-i18n="section.adapters">Adaptörler</div>
...
<h2 data-i18n="drawer.title">Adaptörler</h2>
<input type="text" data-i18n-placeholder="drawer.search" placeholder="Adaptör ara…">
<button class="active" data-filter="all" data-i18n="filter.all">Tümü</button>
<button data-filter="active" data-i18n="filter.active">Aktif</button>
<button data-filter="inactive" data-i18n="filter.inactive">Pasif</button>
<button class="tab active" data-panel="ip" data-i18n="tab.ip">IP / DNS</button>
<button class="tab" data-panel="proxy" data-i18n="tab.proxy">Proxy</button>
<button class="tab" data-panel="wifi" data-i18n="tab.wifi">Ağlar</button>
<footer data-i18n="footer.adminNotice">Yönetici olarak çalışıyor</footer>
```

Add `<script src="i18n.js"></script>` before `<script src="app.js"></script>` in `index.html`.

In `app.js`, change the `DOMContentLoaded` handler's last line from `refreshAdapters();` to:

```js
loadI18n().then(() => {
  applyI18n();
  refreshAdapters();
});
```

And update `statusLabel()` to use `t()`:

```js
function statusLabel(status) {
  if (status === 'up') return t('status.up');
  if (status === 'down') return t('status.down');
  return t('status.idle');
}
```

And the Wi-Fi scan button / connected tag / scan placeholder text in `fillWifiPanel` should use `t('wifi.connected')` instead of the hardcoded `"Bağlı"`.

- [ ] **Step 11: Manual test — verify both locales**

Run: temporarily change your Windows display language (or hardcode `resolveLocale` to return `'en'` for a quick check), restart the app.
Expected: all static labels and dynamic status text switch language; no language picker is visible anywhere in the UI.

- [ ] **Step 12: Commit**

```bash
git add src/ test/
git commit -m "feat: auto-detect TR/EN UI language from system locale"
```

---

## Task 9: Settings screen + persistence (theme, autostart)

**Files:**
- Create: `src/main/settings.js`
- Create: `test/settings.test.js`
- Modify: `test/run-all.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`
- Create: `src/renderer/settings.html`
- Create: `src/renderer/settings.js`

**Interfaces:**
- Produces: `defaultSettings(): {theme: 'system'|'light'|'dark', autostart: boolean}`.
- Produces: `readSettingsFile(raw: string): object` (pure — parses JSON, falls back to defaults on bad input).
- Produces: `getSettings(): {theme, autostart}`, `setSettings(partial): {theme, autostart}` (persist to `app.getPath('userData')/settings.json`, also toggle `app.setLoginItemSettings` for `autostart`).
- Produces: IPC channels `settings:get`, `settings:set`.
- Produces: `window.api.settings.get()`, `window.api.settings.set(partial)`.

- [ ] **Step 1: Write the failing test for settings parsing**

Create `test/settings.test.js`:

```js
const assert = require('assert');
const { defaultSettings, readSettingsFile } = require('../src/main/settings');

function test_default_settings_shape() {
  const d = defaultSettings();
  assert.deepStrictEqual(d, { theme: 'system', autostart: true });
}

function test_reads_valid_json() {
  const result = readSettingsFile('{"theme":"dark","autostart":false}');
  assert.deepStrictEqual(result, { theme: 'dark', autostart: false });
}

function test_falls_back_to_defaults_on_invalid_json() {
  const result = readSettingsFile('not json');
  assert.deepStrictEqual(result, defaultSettings());
}

function test_merges_partial_saved_settings_with_defaults() {
  const result = readSettingsFile('{"theme":"light"}');
  assert.deepStrictEqual(result, { theme: 'light', autostart: true });
}

module.exports = {
  test_default_settings_shape,
  test_reads_valid_json,
  test_falls_back_to_defaults_on_invalid_json,
  test_merges_partial_saved_settings_with_defaults
};
```

- [ ] **Step 2: Register in `test/run-all.js`**

```js
require('./settings.test.js')
```
(add to the `modules` array)

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/settings'`.

- [ ] **Step 4: Write `src/main/settings.js`**

```js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function defaultSettings() {
  return { theme: 'system', autostart: true };
}

function readSettingsFile(raw) {
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

let cache = null;

function getSettings() {
  if (cache) return cache;
  try {
    cache = readSettingsFile(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    cache = defaultSettings();
  }
  return cache;
}

function setSettings(partial) {
  cache = { ...getSettings(), ...partial };
  fs.writeFileSync(settingsPath(), JSON.stringify(cache, null, 2));
  if (typeof partial.autostart === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: partial.autostart });
  }
  return cache;
}

module.exports = { defaultSettings, readSettingsFile, getSettings, setSettings };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `17/17 passed`

- [ ] **Step 6: Register IPC handlers in `src/main/index.js`**

```js
const { getSettings, setSettings } = require('./settings');

ipcMain.handle('settings:get', async () => getSettings());
ipcMain.handle('settings:set', async (_event, partial) => setSettings(partial));
```

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
settings: {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (partial) => ipcRenderer.invoke('settings:set', partial)
}
```

- [ ] **Step 8: Add a settings icon button + minimal settings page**

In `src/renderer/index.html`, the existing gear `.icon-btn` (title="Ayarlar") should navigate to the settings page instead of doing nothing:

```html
<button class="icon-btn" id="settingsBtn" title="Ayarlar" data-i18n-title="settings.title">...</button>
```

Add to the bottom of `<body>` in `index.html`, right before `<script src="i18n.js">`:

```html
<script>
  document.getElementById('settingsBtn').addEventListener('click', () => {
    window.location.href = 'settings.html';
  });
</script>
```

Create `src/renderer/settings.html` (reuses `styles.css` for visual consistency):

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Ayarlar</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <div class="toolbar">
      <div class="toolbar-title">
        <button class="icon-btn" id="backBtn">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span>Ayarlar</span>
      </div>
    </div>
    <main>
      <div class="section-label">Görünüm</div>
      <div class="segmented" id="themeSwitch">
        <button data-value="light">Açık</button>
        <button data-value="dark">Koyu</button>
        <button data-value="system" class="active">Sistem</button>
      </div>

      <div class="section-label">Sistem</div>
      <div class="auto-card">
        <div class="auto-copy">
          <h3>Windows başlangıcında otomatik başlat</h3>
        </div>
        <button class="switch" id="autostartSwitch" data-on="true"></button>
      </div>
    </main>
  </div>
  <script src="settings.js"></script>
</body>
</html>
```

Create `src/renderer/settings.js`:

```js
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

async function init() {
  const settings = await window.api.settings.get();

  document.querySelectorAll('#themeSwitch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === settings.theme);
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#themeSwitch button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      await window.api.settings.set({ theme: btn.dataset.value });
      document.documentElement.dataset.theme = btn.dataset.value === 'system' ? '' : btn.dataset.value;
    });
  });

  const autostartSwitch = document.getElementById('autostartSwitch');
  autostartSwitch.dataset.on = String(settings.autostart);
  autostartSwitch.addEventListener('click', async () => {
    const next = autostartSwitch.dataset.on !== 'true';
    autostartSwitch.dataset.on = String(next);
    await window.api.settings.set({ autostart: next });
  });
}

init();
```

- [ ] **Step 9: Apply the saved theme on every page load**

Add to the top of `src/renderer/app.js`'s `DOMContentLoaded` handler (and to a new small inline script at the top of `settings.html`'s `<body>`, before `styles.css` takes effect, to avoid a flash):

```js
window.api.settings.get().then((s) => {
  if (s.theme !== 'system') document.documentElement.dataset.theme = s.theme;
});
```

- [ ] **Step 10: Manual test**

Run: `npm start`. Open Ayarlar, switch theme to Koyu, confirm the whole app goes dark immediately and stays dark after closing/reopening. Toggle autostart off, confirm (via `shell:startup` folder or Task Manager → Startup apps) the app is no longer set to launch at login; toggle back on.
Expected: both settings persist across restarts.

- [ ] **Step 11: Commit**

```bash
git add src/ test/
git commit -m "feat: add settings screen with theme and autostart persistence"
```

---

## Task 10: Auto Mode (Ethernet↔Wi-Fi) + tray icon + hide-to-tray

**Files:**
- Create: `src/main/autoMode.js`
- Create: `test/autoMode.test.js`
- Modify: `test/run-all.js`
- Create: `src/main/tray.js`
- Create: `assets/tray-icon.png` (16x16 or 32x32 PNG — placeholder acceptable, replace with real art later)
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`
- Modify: `src/renderer/app.js` (wire the Otomatik Mod switch)

**Interfaces:**
- Consumes: `listAdapters` (Task 2), `toggleAdapter` (Task 3), `getSettings`/`setSettings` (Task 9).
- Produces: `decideAutoModeActions(adapters: Array<{type, status}>): Array<{type, enable: boolean}>` (pure — the reconciliation logic).
- Produces: `startAutoMode()`, `stopAutoMode()`, `isAutoModeRunning(): boolean` in `autoMode.js`.
- Produces: IPC channels `autoMode:get`, `autoMode:set`.
- Produces: `window.api.autoMode.get()`, `window.api.autoMode.set(enabled)`.
- Produces: `createTray(mainWindow)` in `tray.js`, called from `index.js`.

- [ ] **Step 1: Write the failing test for the reconciliation logic**

Create `test/autoMode.test.js`:

```js
const assert = require('assert');
const { decideAutoModeActions } = require('../src/main/autoMode');

function test_ethernet_up_disables_wifi() {
  const adapters = [
    { type: 'ethernet', status: 'up' },
    { type: 'wifi', status: 'up' }
  ];
  const actions = decideAutoModeActions(adapters);
  assert.deepStrictEqual(actions, [{ type: 'wifi', enable: false }]);
}

function test_ethernet_down_enables_wifi() {
  const adapters = [
    { type: 'ethernet', status: 'down' },
    { type: 'wifi', status: 'down' }
  ];
  const actions = decideAutoModeActions(adapters);
  assert.deepStrictEqual(actions, [{ type: 'wifi', enable: true }]);
}

function test_no_change_when_already_correct() {
  const adapters = [
    { type: 'ethernet', status: 'up' },
    { type: 'wifi', status: 'down' }
  ];
  assert.deepStrictEqual(decideAutoModeActions(adapters), []);
}

function test_ethernet_idle_treated_as_disconnected() {
  const adapters = [
    { type: 'ethernet', status: 'idle' },
    { type: 'wifi', status: 'down' }
  ];
  assert.deepStrictEqual(decideAutoModeActions(adapters), [{ type: 'wifi', enable: true }]);
}

module.exports = {
  test_ethernet_up_disables_wifi,
  test_ethernet_down_enables_wifi,
  test_no_change_when_already_correct,
  test_ethernet_idle_treated_as_disconnected
};
```

- [ ] **Step 2: Register in `test/run-all.js`**

```js
require('./autoMode.test.js')
```
(add to `modules`)

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/autoMode'`.

- [ ] **Step 4: Write `src/main/autoMode.js`**

```js
const { listAdapters, toggleAdapter } = require('./services/adapters');

const POLL_INTERVAL_MS = 3000;
let timer = null;

function decideAutoModeActions(adapters) {
  const ethernetUp = adapters.some((a) => a.type === 'ethernet' && a.status === 'up');
  const wifiEnabled = adapters.some((a) => a.type === 'wifi' && a.status !== 'down');
  const actions = [];
  if (ethernetUp && wifiEnabled) actions.push({ type: 'wifi', enable: false });
  if (!ethernetUp && !wifiEnabled) actions.push({ type: 'wifi', enable: true });
  return actions;
}

async function tick() {
  const adapters = await listAdapters();
  const actions = decideAutoModeActions(adapters);
  for (const action of actions) {
    const target = adapters.find((a) => a.type === action.type);
    if (target) await toggleAdapter(target.id, action.enable);
  }
}

function startAutoMode() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
  tick().catch(() => {});
}

function stopAutoMode() {
  if (timer) clearInterval(timer);
  timer = null;
}

function isAutoModeRunning() {
  return timer !== null;
}

module.exports = { decideAutoModeActions, startAutoMode, stopAutoMode, isAutoModeRunning };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `21/21 passed`

- [ ] **Step 6: Persist the Auto Mode on/off flag via settings and register IPC in `src/main/index.js`**

```js
const { startAutoMode, stopAutoMode, isAutoModeRunning } = require('./autoMode');

ipcMain.handle('autoMode:get', async () => isAutoModeRunning());
ipcMain.handle('autoMode:set', async (_event, enabled) => {
  if (enabled) startAutoMode(); else stopAutoMode();
  setSettings({ autoMode: enabled });
  return isAutoModeRunning();
});
```

Add `autoMode: true` to `defaultSettings()` in `src/main/settings.js`, and start it at boot — inside `app.whenReady().then(createWindow)`, change to:

```js
app.whenReady().then(() => {
  createWindow();
  if (getSettings().autoMode) startAutoMode();
});
```

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
autoMode: {
  get: () => ipcRenderer.invoke('autoMode:get'),
  set: (enabled) => ipcRenderer.invoke('autoMode:set', enabled)
}
```

- [ ] **Step 8: Create a placeholder tray icon**

Create `assets/tray-icon.png` — any 32x32 PNG works for now (e.g. export a simple blue circle from any image tool); replace with real branded art before shipping v1.0.

- [ ] **Step 9: Write `src/main/tray.js`**

```js
const { Tray, Menu, app } = require('electron');
const path = require('path');
const { isAutoModeRunning, startAutoMode, stopAutoMode } = require('./autoMode');

let tray = null;

function createTray(mainWindow) {
  tray = new Tray(path.join(__dirname, '../../assets/tray-icon.png'));
  tray.setToolTip('NetworkAdapterManager');
  refreshMenu(mainWindow);
  return tray;
}

function refreshMenu(mainWindow) {
  const menu = Menu.buildFromTemplate([
    {
      label: isAutoModeRunning() ? 'Otomatik Modu Kapat' : 'Otomatik Modu Aç',
      click: () => {
        if (isAutoModeRunning()) stopAutoMode(); else startAutoMode();
        refreshMenu(mainWindow);
      }
    },
    { label: 'Pencereyi Göster', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { app.exit(0); } }
  ]);
  tray.setContextMenu(menu);
}

module.exports = { createTray };
```

- [ ] **Step 10: Wire hide-to-tray behavior and tray creation in `src/main/index.js`**

Change `createWindow` to intercept close:

```js
function createWindow() {
  mainWindow = new BrowserWindow({ /* ...unchanged... */ });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}
```

And in the `app.whenReady()` block:

```js
app.whenReady().then(() => {
  createWindow();
  createTray(mainWindow);
  if (getSettings().autoMode) startAutoMode();
});

app.on('before-quit', () => { app.isQuitting = true; });
```

Import `createTray` at the top: `const { createTray } = require('./tray');`

- [ ] **Step 11: Wire the Otomatik Mod switch in `src/renderer/app.js`**

Add to the `DOMContentLoaded` handler, after `loadI18n().then(...)`:

```js
const autoSwitch = document.querySelector('.auto-card .switch');
window.api.autoMode.get().then((enabled) => { autoSwitch.dataset.on = String(enabled); });
autoSwitch.addEventListener('click', async () => {
  const next = autoSwitch.dataset.on !== 'true';
  await window.api.autoMode.set(next);
  autoSwitch.dataset.on = String(next);
});
```

Remove the mockup's old inline `onclick="this.dataset.on = ..."` attribute from the Otomatik Mod switch button in `index.html` — this listener replaces it.

- [ ] **Step 12: Manual test**

Run: elevated `npm start`. Turn Otomatik Mod on, plug in Ethernet, confirm Wi-Fi disables itself within ~3s; unplug Ethernet, confirm Wi-Fi re-enables. Close the window with the X button, confirm the app keeps running in the tray (icon visible, adapters still auto-switching); right-click the tray icon and use "Pencereyi Göster" and "Çıkış".
Expected: all of the above work as described.

- [ ] **Step 13: Commit**

```bash
git add src/ test/ assets/
git commit -m "feat: add Auto Mode background watcher and system tray"
```

---

## Task 11: Custom updater (online GitHub + offline UNC share)

**Files:**
- Create: `src/main/updater.js`
- Create: `test/updater.test.js`
- Modify: `test/run-all.js`
- Modify: `src/main/index.js`
- Modify: `src/preload/preload.js`
- Modify: `src/renderer/settings.html` / `src/renderer/settings.js` (manual "check for updates" button)

**Interfaces:**
- Produces: `compareVersions(a: string, b: string): -1|0|1` (pure, semver-lite: `MAJOR.MINOR.PATCH`).
- Produces: `pickUpdateSource(current: string, online: {version, url}|null, offline: {version, path}|null): {version, source: 'online'|'offline', location: string}|null` (pure — picks the newer of the two candidates, preferring online on a tie).
- Produces: `checkForUpdate(): Promise<{version, source, location}|null>`.
- Produces: `downloadAndInstall(update): Promise<void>` (downloads if online, copies if offline, then spawns the installer silently and quits).
- Produces: IPC channels `updater:check`, `updater:apply`.
- Produces: `window.api.updater.check()`, `window.api.updater.apply(update)`.

- [ ] **Step 1: Write the failing tests for the pure logic**

Create `test/updater.test.js`:

```js
const assert = require('assert');
const { compareVersions, pickUpdateSource } = require('../src/main/updater');

function test_compare_versions() {
  assert.strictEqual(compareVersions('1.2.0', '1.3.0'), -1);
  assert.strictEqual(compareVersions('1.3.0', '1.2.0'), 1);
  assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
  assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
}

function test_picks_online_when_only_online_available() {
  const result = pickUpdateSource('0.1.0', { version: '0.2.0', url: 'https://x/y.exe' }, null);
  assert.deepStrictEqual(result, { version: '0.2.0', source: 'online', location: 'https://x/y.exe' });
}

function test_picks_offline_when_only_offline_available() {
  const result = pickUpdateSource('0.1.0', null, { version: '0.2.0', path: '\\\\share\\a.exe' });
  assert.deepStrictEqual(result, { version: '0.2.0', source: 'offline', location: '\\\\share\\a.exe' });
}

function test_picks_newer_of_the_two_when_both_available() {
  const result = pickUpdateSource(
    '0.1.0',
    { version: '0.2.0', url: 'https://x/y.exe' },
    { version: '0.3.0', path: '\\\\share\\a.exe' }
  );
  assert.strictEqual(result.version, '0.3.0');
  assert.strictEqual(result.source, 'offline');
}

function test_returns_null_when_current_is_newest() {
  const result = pickUpdateSource('1.0.0', { version: '0.9.0', url: 'x' }, { version: '0.8.0', path: 'y' });
  assert.strictEqual(result, null);
}

module.exports = {
  test_compare_versions,
  test_picks_online_when_only_online_available,
  test_picks_offline_when_only_offline_available,
  test_picks_newer_of_the_two_when_both_available,
  test_returns_null_when_current_is_newest
};
```

- [ ] **Step 2: Register in `test/run-all.js`**

```js
require('./updater.test.js')
```
(add to `modules`)

- [ ] **Step 3: Run test to verify it fails**

Run: `node test/run-all.js`
Expected: FAIL — `Cannot find module '../src/main/updater'`.

- [ ] **Step 4: Write `src/main/updater.js`**

```js
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { app } = require('electron');

const GITHUB_REPO = 'Fatal-IV/AdapterManager';
const OFFLINE_UPDATE_DIR = '\\\\ab30200-0111\\BİLGİ İŞLEM\\Umut\\AdapterManager\\Güncellemeler';

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function pickUpdateSource(current, online, offline) {
  const candidates = [];
  if (online && compareVersions(online.version, current) > 0) {
    candidates.push({ version: online.version, source: 'online', location: online.url });
  }
  if (offline && compareVersions(offline.version, current) > 0) {
    candidates.push({ version: offline.version, source: 'offline', location: offline.path });
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => compareVersions(y.version, x.version));
  return candidates[0];
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AdapterManager' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

async function fetchOnlineCandidate() {
  try {
    const release = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const asset = (release.assets || []).find((a) => a.name.endsWith('.exe'));
    if (!asset) return null;
    return { version: release.tag_name.replace(/^v/, ''), url: asset.browser_download_url };
  } catch {
    return null;
  }
}

async function fetchOfflineCandidate() {
  try {
    const manifestPath = path.join(OFFLINE_UPDATE_DIR, 'latest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return { version: manifest.version, path: path.join(OFFLINE_UPDATE_DIR, manifest.file) };
  } catch {
    return null;
  }
}

async function checkForUpdate() {
  const current = app.getVersion();
  const [online, offline] = await Promise.all([fetchOnlineCandidate(), fetchOfflineCandidate()]);
  return pickUpdateSource(current, online, offline);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function downloadAndInstall(update) {
  const installerPath = path.join(os.tmpdir(), 'AdapterManagerSetup.exe');
  if (update.source === 'online') {
    await downloadFile(update.location, installerPath);
  } else {
    fs.copyFileSync(update.location, installerPath);
  }
  spawn(installerPath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

module.exports = { compareVersions, pickUpdateSource, checkForUpdate, downloadAndInstall };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node test/run-all.js`
Expected: `26/26 passed`

- [ ] **Step 6: Register IPC handlers in `src/main/index.js`**

```js
const { checkForUpdate, downloadAndInstall } = require('./updater');

ipcMain.handle('updater:check', async () => checkForUpdate());
ipcMain.handle('updater:apply', async (_event, update) => downloadAndInstall(update));
```

Also call `checkForUpdate()` once at startup (informational only — do not auto-apply):

```js
app.whenReady().then(() => {
  createWindow();
  createTray(mainWindow);
  if (getSettings().autoMode) startAutoMode();
  checkForUpdate().then((update) => {
    if (update) mainWindow.webContents.send('updater:available', update);
  }).catch(() => {});
});
```

- [ ] **Step 7: Expose in `src/preload/preload.js`**

```js
updater: {
  check: () => ipcRenderer.invoke('updater:check'),
  apply: (update) => ipcRenderer.invoke('updater:apply', update),
  onAvailable: (callback) => ipcRenderer.on('updater:available', (_event, update) => callback(update))
}
```

- [ ] **Step 8: Add a manual "check for updates" button in `settings.html`/`settings.js`**

Add to `settings.html`, after the autostart card:

```html
<div class="section-label">Güncellemeler</div>
<div class="auto-card">
  <div class="auto-copy">
    <h3 id="updateStatus">Güncellemeleri Denetle</h3>
  </div>
  <button class="wifi-scan-btn" id="checkUpdateBtn">Denetle</button>
</div>
```

Add to `settings.js`:

```js
document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('updateStatus');
  statusEl.textContent = 'Denetleniyor…';
  const update = await window.api.updater.check();
  if (!update) {
    statusEl.textContent = 'En güncel sürümdesiniz';
    return;
  }
  statusEl.textContent = `Yeni sürüm bulundu: ${update.version}`;
  const confirmed = window.confirm(`${update.version} sürümüne güncellemek istiyor musunuz?`);
  if (confirmed) {
    statusEl.textContent = 'İndiriliyor ve kuruluyor…';
    await window.api.updater.apply(update);
  }
});
```

- [ ] **Step 9: Manual test**

Run: `npm start` with no GitHub release published yet and the offline path unreachable — expect "En güncel sürümdesiniz" (both candidates null). Later, after Task 13 publishes a real release with a higher version than `package.json`, re-run and confirm it's detected; do **not** click confirm against a real release until you've verified the installer path end-to-end once with a throwaway build.
Expected: check reports correctly in both the "up to date" and "update available" cases.

- [ ] **Step 10: Commit**

```bash
git add src/ test/
git commit -m "feat: add custom updater (GitHub Releases + offline UNC share)"
```

---

## Task 12: Packaging — electron-builder dir target + Inno Setup 7 installer

**Files:**
- Create: `installer/installer.iss`
- Create: `scripts/build.ps1`
- Modify: `package.json` (already has `build`/`pack` config from Task 1 — verify, adjust icon path)
- Create: `assets/app-icon.ico`

**Interfaces:**
- Produces: a runnable `publish/win-unpacked/NetworkAdapterManager.exe` (via `npm run pack`).
- Produces: `installer/Output/AdapterManagerSetup.exe` (via Inno Setup 7 compiling `installer.iss`).

- [ ] **Step 1: Create a placeholder app icon**

Create `assets/app-icon.ico` — any valid `.ico` works for now (convert `assets/tray-icon.png` with any online/offline ICO converter); replace with final branded icon before v1.0.

- [ ] **Step 2: Point `electron-builder` at the icon in `package.json`**

Update the `"build"` block from Task 1:

```json
"build": {
  "appId": "com.iksoftware.adaptermanager",
  "productName": "NetworkAdapterManager",
  "icon": "assets/app-icon.ico",
  "win": {
    "target": "dir",
    "requestedExecutionLevel": "requireAdmin"
  },
  "directories": { "output": "publish" },
  "files": ["src/**/*", "assets/**/*", "package.json"]
}
```

- [ ] **Step 3: Run the packaging step**

Run: `npm run pack`
Expected: `publish/win-unpacked/NetworkAdapterManager.exe` exists and launches (elevated) with the full app working.

- [ ] **Step 4: Write `installer/installer.iss` (Inno Setup 7)**

```ini
#define MyAppName "NetworkAdapterManager"
#define MyAppVersion "0.1.0"
#define MyAppExeName "NetworkAdapterManager.exe"

[Setup]
AppId={{B6C6B6B0-4F1A-4A9E-9C3E-ADAPTERMANAGER}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=admin
OutputDir=Output
OutputBaseFilename=AdapterManagerSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
SetupIconFile=..\assets\app-icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\publish\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
```

Note: `{#MyAppVersion}` must be bumped by hand (or by a small future release script) to match `package.json`'s `version` before each build — Task 13 documents the release flow.

- [ ] **Step 5: Write `scripts/build.ps1` — one command from source to installer**

```powershell
param(
  [string]$InnoSetupCompiler = "C:\Program Files\Inno Setup 7\ISCC.exe"
)

Write-Host "1/2 Packaging Electron app..."
npm run pack
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "2/2 Compiling installer..."
& $InnoSetupCompiler "installer\installer.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compile failed" }

Write-Host "Done: installer\Output\AdapterManagerSetup.exe"
```

**Note for the implementer:** pass `-InnoSetupCompiler` pointing at your actual Inno Setup 7 install path if it differs from the default above (Inno Setup 7's `ISCC.exe` path depends on install location — check your Start Menu shortcut's target or the install directory).

- [ ] **Step 6: Run the full build and verify the installer**

Run: `powershell -File scripts\build.ps1`
Expected: `installer\Output\AdapterManagerSetup.exe` is produced. Run it, confirm it asks for admin elevation (UAC prompt), installs, creates a Start Menu + Desktop shortcut, and the installed app launches and works.

- [ ] **Step 7: Commit**

```bash
git add installer/ scripts/ assets/ package.json
git commit -m "build: add electron-builder + Inno Setup 7 packaging pipeline"
```

---

## Task 13: GitHub repository + first release

**Files:** none (operational task, uses `gh` CLI — confirm each destructive/visible step with the user before running, per the assistant's own operating rules)

- [ ] **Step 1: Create the public GitHub repository**

Run: `gh repo create Fatal-IV/AdapterManager --public --source=. --remote=origin --description "Windows ağ adaptörü yönetim uygulaması"`
Expected: repo created, `origin` remote added.

- [ ] **Step 2: Push the current history**

Run: `git push -u origin main` (or `master`, matching your default branch name — check with `git branch --show-current` first)
Expected: all commits from Tasks 1–12 appear on GitHub.

- [ ] **Step 3: Tag the release matching `package.json`'s version**

Run: `git tag v0.1.0 && git push origin v0.1.0`

- [ ] **Step 4: Create the GitHub Release with the installer asset**

Run: `gh release create v0.1.0 "installer/Output/AdapterManagerSetup.exe" --title "v0.1.0" --notes "İlk sürüm: adaptör yönetimi, DNS/IP/Proxy düzenleme, Wi-Fi bağlantısı, Otomatik Mod."`
Expected: release visible at `https://github.com/Fatal-IV/AdapterManager/releases/tag/v0.1.0` with the `.exe` asset attached.

- [ ] **Step 5: Verify the updater sees it as "current"**

Run: elevated `npm start` from the source checkout (whose `package.json` version is also `0.1.0`), open Ayarlar → Denetle.
Expected: "En güncel sürümdesiniz" (since the running version equals the just-published release version).

- [ ] **Step 6: Copy the same installer to the offline update share**

Run (once the share is reachable from a machine that can write to it):

```powershell
$dest = "\\ab30200-0111\BİLGİ İŞLEM\Umut\AdapterManager\Güncellemeler"
Copy-Item "installer\Output\AdapterManagerSetup.exe" "$dest\AdapterManagerSetup.exe"
'{"version":"0.1.0","file":"AdapterManagerSetup.exe"}' | Out-File -Encoding utf8 "$dest\latest.json"
```

Expected: offline update candidate also reports "current" for a `0.1.0` install, matching the online one.

---

## Self-Review Notes

- **Spec coverage:** adapter list/toggle (Tasks 2–3), IP/DNS (Task 4), proxy (Task 5), Wi-Fi scan/connect (Task 6), full mockup UI (Task 7), auto-locale i18n (Task 8), theme + autostart settings (Task 9), Auto Mode + tray (Task 10), custom online/offline updater (Task 11), Inno Setup 7 packaging (Task 12), public GitHub repo + release + offline share population (Task 13) — every section of the design doc has a task.
- **contextIsolation/nodeIntegration constraint** is honored throughout — every new main-process capability is added behind `ipcMain.handle` + `contextBridge`, never by loosening `webPreferences`.
- **No electron-updater, no native addon, no language picker** — verified absent from every task.
