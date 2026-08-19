function resolveLocale(systemLocale) {
  return (systemLocale || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

module.exports = { resolveLocale };
