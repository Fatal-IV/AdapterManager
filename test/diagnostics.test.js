const assert = require('assert');
const { parsePingOutput, parseNetworkCategory } = require('../src/main/services/diagnostics');

function test_parses_successful_ping_average() {
  const raw = [
    'Pinging 8.8.8.8 with 32 bytes of data:',
    'Reply from 8.8.8.8: bytes=32 time=23ms TTL=116',
    'Reply from 8.8.8.8: bytes=32 time=27ms TTL=116',
    '',
    'Ping statistics for 8.8.8.8:',
    '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
    'Approximate round trip times in milli-seconds:',
    '    Minimum = 22ms, Maximum = 27ms, Average = 23ms'
  ].join('\r\n');
  const result = parsePingOutput(raw);
  assert.strictEqual(result.avgMs, 23);
}

function test_parses_failed_ping_as_null() {
  const raw = [
    'Pinging 10.255.255.1 with 32 bytes of data:',
    'Request timed out.',
    'Request timed out.',
    '',
    'Ping statistics for 10.255.255.1:',
    '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),'
  ].join('\r\n');
  const result = parsePingOutput(raw);
  assert.strictEqual(result.avgMs, null);
}

function test_maps_network_category_public() {
  assert.strictEqual(parseNetworkCategory('Public'), 'public');
}

function test_maps_network_category_private() {
  assert.strictEqual(parseNetworkCategory('Private'), 'private');
}

function test_maps_network_category_domain() {
  assert.strictEqual(parseNetworkCategory('DomainAuthenticated'), 'domain');
}

module.exports = {
  test_parses_successful_ping_average,
  test_parses_failed_ping_as_null,
  test_maps_network_category_public,
  test_maps_network_category_private,
  test_maps_network_category_domain
};
