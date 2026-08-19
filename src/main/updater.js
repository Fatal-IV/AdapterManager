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
