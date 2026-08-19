const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function defaultSettings() {
  return { theme: 'system', autostart: true, autoMode: true };
}

function readSettingsFile(raw) {
  try {
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed };
  } catch {
    return defaultSettings();
  }
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

let cache = null;

function getSettings() {
  if (cache) return cache;
  try {
    cache = readSettingsFile(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    cache = defaultSettings();
  }
  return cache;
}

function setSettings(partial) {
  cache = { ...getSettings(), ...partial };
  fs.writeFileSync(settingsPath(), JSON.stringify(cache, null, 2));
  if (typeof partial.autostart === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: partial.autostart });
  }
  return cache;
}

module.exports = { defaultSettings, readSettingsFile, getSettings, setSettings };
