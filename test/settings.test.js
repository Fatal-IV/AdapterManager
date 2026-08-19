const assert = require('assert');
const { defaultSettings, readSettingsFile } = require('../src/main/settings');

function test_default_settings_shape() {
  const d = defaultSettings();
  assert.deepStrictEqual(d, { theme: 'system', autostart: true, autoMode: true });
}

function test_reads_valid_json() {
  const result = readSettingsFile('{"theme":"dark","autostart":false,"autoMode":false}');
  assert.deepStrictEqual(result, { theme: 'dark', autostart: false, autoMode: false });
}

function test_falls_back_to_defaults_on_invalid_json() {
  const result = readSettingsFile('not json');
  assert.deepStrictEqual(result, defaultSettings());
}

function test_merges_partial_saved_settings_with_defaults() {
  const result = readSettingsFile('{"theme":"light"}');
  assert.deepStrictEqual(result, { theme: 'light', autostart: true, autoMode: true });
}

module.exports = {
  test_default_settings_shape,
  test_reads_valid_json,
  test_falls_back_to_defaults_on_invalid_json,
  test_merges_partial_saved_settings_with_defaults
};
