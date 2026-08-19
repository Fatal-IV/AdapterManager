const https = require('https');
const dns = require('dns');
const { runPowerShell } = require('./powershell');

function parsePingOutput(raw) {
  const m = raw.match(/Average = (\d+)ms/i);
  return { avgMs: m ? parseInt(m[1], 10) : null };
}

async function pingHost(host, count = 4) {
  const raw = await runPowerShell(`ping -n ${count} ${host}`);
  return parsePingOutput(raw);
}

function parseNetworkCategory(raw) {
  const value = (raw || '').trim();
  if (value === 'Private') return 'private';
  if (value === 'DomainAuthenticated') return 'domain';
  return 'public';
}

async function getNetworkProfile(name) {
  try {
    const raw = await runPowerShell(
      `(Get-NetConnectionProfile -InterfaceAlias "${name}").NetworkCategory.ToString()`
    );
    return { category: parseNetworkCategory(raw) };
  } catch {
    return { category: 'public' };
  }
}

async function getIpv6Address(name) {
  try {
    const raw = await runPowerShell(
      `(Get-NetIPAddress -InterfaceAlias "${name}" -AddressFamily IPv6 -ErrorAction Stop | Where-Object { $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress`
    );
    return raw.trim();
  } catch {
    return '';
  }
}

async function measureDnsLookup(hostname = 'google.com') {
  const start = Date.now();
  try {
    await new Promise((resolve, reject) => {
      dns.lookup(hostname, (err, address) => (err ? reject(err) : resolve(address)));
    });
    return { ms: Date.now() - start };
  } catch {
    return { ms: null };
  }
}

function measureDownloadSpeed(bytes = 10000000) {
  return new Promise((resolve) => {
    const start = Date.now();
    https.get(`https://speed.cloudflare.com/__down?bytes=${bytes}`, (res) => {
      let received = 0;
      res.on('data', (chunk) => { received += chunk.length; });
      res.on('end', () => {
        const seconds = (Date.now() - start) / 1000;
        resolve({ mbps: seconds > 0 ? (received * 8) / seconds / 1e6 : 0 });
      });
    }).on('error', () => resolve({ mbps: null }));
  });
}

function measureUploadSpeed(bytes = 5000000) {
  return new Promise((resolve) => {
    const payload = Buffer.alloc(bytes, 'a');
    const start = Date.now();
    const req = https.request(
      'https://speed.cloudflare.com/__up',
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length } },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const seconds = (Date.now() - start) / 1000;
          resolve({ mbps: seconds > 0 ? (payload.length * 8) / seconds / 1e6 : 0 });
        });
      }
    );
    req.on('error', () => resolve({ mbps: null }));
    req.write(payload);
    req.end();
  });
}

module.exports = {
  parsePingOutput,
  pingHost,
  parseNetworkCategory,
  getNetworkProfile,
  getIpv6Address,
  measureDnsLookup,
  measureDownloadSpeed,
  measureUploadSpeed
};
