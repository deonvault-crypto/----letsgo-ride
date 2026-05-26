const { withXcodeProject, withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Android Configuration: Link local .aar file
 */
const withAndroidFaceTec = (config) => {
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("facetec-sdk")) {
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
 * iOS Configuration: Link local FaceTecSDK.framework
 */
const withIosFaceTec = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const targetUuid = project.getFirstTarget().uuid;
    
    const frameworkDir = path.resolve(config.modRequest.projectRoot, 'vendor/facetec/ios');
    const relativeFrameworkPath = '$(PROJECT_DIR)/../vendor/facetec/ios';

    // Ensure Framework Search Paths includes our local vendor folder
    project.addToBuildSettings('FRAMEWORK_SEARCH_PATHS', relativeFrameworkPath, targetUuid);

    const frameworkName = 'FaceTecSDK.framework';
    const frameworkFullPath = path.join(frameworkDir, frameworkName);

    if (fs.existsSync(frameworkFullPath)) {
      // Add framework to Xcode project
      // The xcode library handles UUID generation and pbxproj structure internally
      project.addFramework(frameworkFullPath, {
        target: targetUuid,
        customFramework: true,
        embed: true,
        sign: true,
      });
    }

    return config;
  });
};

const withFaceTec = (config) => {
  config = withAndroidFaceTec(config);
  config = withIosFaceTec(config);
  return config;
};

module.exports = createRunOncePlugin(withFaceTec, 'withFaceTec', '1.0.0');
