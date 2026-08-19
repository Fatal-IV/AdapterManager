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
  const raw = await runPowerShell('netsh wlan show interfaces');
  const m = raw.match(/^\s*SSID\s*:\s*(.+)$/im);
  return m ? m[1].trim() : '';
}

async function scanWifi() {
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
