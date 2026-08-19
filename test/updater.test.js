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
