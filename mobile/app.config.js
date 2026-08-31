const path = require("path");

module.exports = ({ config }) => {
  // Generate small original notification WAV assets before Expo applies native
  // notification plugins or EAS packages the project. This keeps the sounds
  // deterministic and avoids shipping third-party/copyrighted ringtone assets.
  require(path.resolve(__dirname, "scripts/generate-notification-sounds.js"));
  return config;
};
