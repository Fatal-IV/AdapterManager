const { runPowerShell } = require('./powershell');

function parseIpConfig(raw) {
  const lines = raw.split(/\r?\n/);
  const dhcp = /DHCP enabled:\s*Yes/i.test(raw);
  const ip = (raw.match(/IPv?4? ?Address:\s*([\d.]+)/i) || [])[1] || '';
  const subnetLine = raw.match(/Subnet Prefix:.*mask ([\d.]+)/i);
  const subnet = subnetLine ? subnetLine[1] : '';
  const gateway = (raw.match(/Default Gateway:\s*([\d.]+)/i) || [])[1] || '';

  const dns = [];
  let inDnsBlock = false;
  for (const line of lines) {
    if (/DNS.*Servers.*:/i.test(line)) {
      inDnsBlock = true;
      const first = line.match(/:\s*([\d.]+)\s*$/);
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
