const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  IOSConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("@expo/config-plugins");

const IOS_FRAMEWORK_SOURCE = path.join("vendor", "facetec", "ios", "FaceTecSDK-ios-9.7.122", "FaceTecSDK.framework");
const ANDROID_AAR_SOURCE = path.join("vendor", "facetec", "android", "FaceTecSDK-android-9.7.127", "facetec-sdk-9.7.127.aar");

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`FaceTec asset not found: ${source}`);
  }
  fs.cpSync(source, target, { recursive: true, force: true });
}

function withFaceTec(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription =
      config.modResults.NSCameraUsageDescription ||
      "LetsGoRide uses the camera during identity verification to scan your face and driver documents.";
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    AndroidConfig.Permissions.addPermission(config.modResults, "android.permission.CAMERA");
    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const source = path.join(config.modRequest.projectRoot, IOS_FRAMEWORK_SOURCE);
      const target = path.join(config.modRequest.platformProjectRoot, "FaceTecSDK.framework");
      copyRecursive(source, target);
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const frameworkPath = "FaceTecSDK.framework";
    const alreadyLinked = project.pbxEmbedFrameworksBuildPhaseObj?.files?.some((file) => String(file.comment || "").includes(frameworkPath));
    if (!alreadyLinked) {
      project.addFramework(frameworkPath, { embed: true, sign: true });
    }
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    (config) => {
      const source = path.join(config.modRequest.projectRoot, ANDROID_AAR_SOURCE);
      const targetDir = path.join(config.modRequest.platformProjectRoot, "app", "libs");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, path.join(targetDir, "facetec-sdk-9.7.127.aar"));
      return config;
    },
  ]);

  config = withAppBuildGradle(config, (config) => {
    const dependency = "implementation files('libs/facetec-sdk-9.7.127.aar')";
    if (!config.modResults.contents.includes(dependency)) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dependency}`,
      );
    }
    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(withFaceTec, "withFaceTec", "1.0.0");
