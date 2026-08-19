const assert = require('assert');
const { parseIpConfig, parseProxyConfig } = require('../src/main/services/network');

function test_parses_dhcp_enabled_config() {
  // Matches real `netsh interface ip show config` output on Windows 11
  const raw = [
    'Configuration for interface "Wi-Fi"',
    '    DHCP enabled:                         Yes',
    '    IP Address:                           192.168.1.37',
    '    Subnet Prefix:                        192.168.1.0/24 (mask 255.255.255.0)',
    '    Default Gateway:                      192.168.1.1',
    '    Gateway Metric:                       0',
    '    InterfaceMetric:                      50',
    '    DNS servers configured through DHCP:  8.8.8.8',
    '                                           8.8.4.4',
    '    Register with which suffix:           Primary only'
  ].join('\r\n');
  const cfg = parseIpConfig(raw);
  assert.strictEqual(cfg.dhcp, true);
  assert.strictEqual(cfg.ip, '192.168.1.37');
  assert.strictEqual(cfg.subnet, '255.255.255.0');
  assert.strictEqual(cfg.gateway, '192.168.1.1');
  assert.deepStrictEqual(cfg.dns, ['8.8.8.8', '8.8.4.4']);
}

function test_parses_dhcp_disabled_config() {
  const raw = [
    'Configuration for interface "Ethernet"',
    '    DHCP enabled:                         No',
    '    IP Address:                           10.0.0.5',
    '    Subnet Prefix:                        10.0.0.0/24 (mask 255.255.255.0)',
    '    Default Gateway:                      10.0.0.1',
    '    Statically Configured DNS Servers:    1.1.1.1'
  ].join('\r\n');
  const cfg = parseIpConfig(raw);
  assert.strictEqual(cfg.dhcp, false);
  assert.deepStrictEqual(cfg.dns, ['1.1.1.1']);
}

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

module.exports = {
  test_parses_dhcp_enabled_config,
  test_parses_dhcp_disabled_config,
  test_parses_manual_proxy_enabled,
  test_parses_auto_config_script,
  test_parses_proxy_off
};
