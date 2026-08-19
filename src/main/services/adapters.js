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

function buildToggleCommand(name, enable) {
  const verb = enable ? 'Enable-NetAdapter' : 'Disable-NetAdapter';
  return `${verb} -Name "${name}" -Confirm:$false`;
}

async function toggleAdapter(name, enable) {
  await runPowerShell(buildToggleCommand(name, enable));
}

module.exports = { parseAdaptersJson, listAdapters, buildToggleCommand, toggleAdapter };
