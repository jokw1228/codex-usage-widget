const fs = require("fs");
const path = require("path");
const { clamp, normalizeWindowBounds } = require("./window-bounds");

const DEFAULT_SETTINGS = {
  opacity: 0.95,
  windowBounds: null
};

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    opacity: clamp(value?.opacity ?? DEFAULT_SETTINGS.opacity, 0.45, 1),
    windowBounds: normalizeWindowBounds(value?.windowBounds)
  };
}

function createSettingsStore(settingsPath) {
  return {
    load() {
      try {
        return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    save(value) {
      const settings = normalizeSettings(value);
      try {
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
      } catch {
        // Keep the live settings usable when the file cannot be written.
      }
      return settings;
    }
  };
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings, createSettingsStore };
