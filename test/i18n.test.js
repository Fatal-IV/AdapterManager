const assert = require('assert');
const { resolveLocale } = require('../src/main/services/i18n');

function test_turkish_locale_maps_to_tr() {
  assert.strictEqual(resolveLocale('tr-TR'), 'tr');
  assert.strictEqual(resolveLocale('tr'), 'tr');
}

function test_other_locales_fall_back_to_en() {
  assert.strictEqual(resolveLocale('de-DE'), 'en');
  assert.strictEqual(resolveLocale('en-US'), 'en');
  assert.strictEqual(resolveLocale(''), 'en');
}

module.exports = { test_turkish_locale_maps_to_tr, test_other_locales_fall_back_to_en };
