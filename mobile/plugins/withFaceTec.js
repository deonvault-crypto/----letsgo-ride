const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Android Configuration: Link local .aar file
 */
const withAndroidFaceTec = (config) => {
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('facetec-sdk')) {
      const implementationLine = `\n    implementation fileTree(dir: "../vendor/facetec/android", include: ["*.aar"])\n`;
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/, 
        `dependencies {${implementationLine}`
      );
    }
    return config;
  });

  return config;
};

/**
 * iOS Configuration: No direct Xcode mutation
 *
 * FaceTec iOS SDK integration requires manual native setup in a bare workflow.
 * This plugin remains lightweight and safe for Expo prebuild/EAS.
 *
 * TODO: Add native iOS framework linking manually in the bare Xcode project
 * when migrating FaceTec into a custom native iOS build.
 */
const withIosFaceTec = (config) => {
  return config;
};

const withFaceTec = (config) => {
  config = withAndroidFaceTec(config);
  config = withIosFaceTec(config);
  return config;
};

module.exports = createRunOncePlugin(withFaceTec, 'withFaceTec', '1.0.0');
