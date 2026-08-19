const assert = require('assert');
const { parseAdaptersJson } = require('../src/main/services/adapters');

function test_parses_single_adapter_object() {
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
