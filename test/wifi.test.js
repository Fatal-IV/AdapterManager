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
