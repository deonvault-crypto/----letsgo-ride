const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = require(path.join(root, "app.json")).expo;
const pkg = require(path.join(root, "package.json"));
const catalogPath = path.join(root, "node_modules", "react-native", "gradle", "libs.versions.toml");

function fail(message) {
  throw new Error(`Android release configuration: ${message}`);
}

function catalogNumber(catalog, name) {
  const match = catalog.match(new RegExp(`^${name}\\s*=\\s*"(\\d+)"`, "m"));
  if (!match) fail(`could not resolve ${name} from the installed React Native toolchain.`);
  return Number(match[1]);
}

if (!fs.existsSync(catalogPath)) fail("React Native Android version catalog is missing; run npm ci first.");
const catalog = fs.readFileSync(catalogPath, "utf8");
const compileSdk = catalogNumber(catalog, "compileSdk");
const targetSdk = catalogNumber(catalog, "targetSdk");
const minSdk = catalogNumber(catalog, "minSdk");

if (compileSdk < 36 || targetSdk < 36) fail(`API 36 is required, resolved compileSdk=${compileSdk}, targetSdk=${targetSdk}.`);
if (app.android.package !== "com.letsgo.ride") fail("the existing Google Play package identity changed.");
if (app.android.allowBackup !== true) fail("Android backup policy must be explicit.");

const secureStorePlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-secure-store");
if (!secureStorePlugin || secureStorePlugin[1]?.configureAndroidBackup !== true) {
  fail("Expo SecureStore backup exclusions must be explicitly generated.");
}

const buildPropertiesPlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties");
const androidBuild = buildPropertiesPlugin?.[1]?.android;
if (
  androidBuild?.compileSdkVersion !== 36
  || androidBuild?.targetSdkVersion !== 36
  || androidBuild?.enableMinifyInReleaseBuilds !== true
  || androidBuild?.enableShrinkResourcesInReleaseBuilds !== true
) {
  fail("API 36 and release R8/resource shrinking must be explicitly pinned.");
}

const permissions = new Set(app.android.permissions || []);
const forbiddenPermissions = [
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.QUERY_ALL_PACKAGES",
  "android.permission.SCHEDULE_EXACT_ALARM",
];
for (const permission of forbiddenPermissions) {
  if (permissions.has(permission)) fail(`unnecessary permission declared: ${permission}.`);
}

const backgroundLocationDeclared = permissions.has("android.permission.ACCESS_BACKGROUND_LOCATION");
if (backgroundLocationDeclared) {
  if (!pkg.dependencies["expo-task-manager"]) {
    fail("background location requires expo-task-manager to be installed and locked.");
  }
  const locationPlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-location");
  const locationConfig = locationPlugin?.[1];
  if (
    locationConfig?.isAndroidBackgroundLocationEnabled !== true
    || locationConfig?.isAndroidForegroundServiceEnabled !== true
  ) {
    fail("background location must be explicitly enabled through the Expo Location plugin.");
  }
  if (!permissions.has("android.permission.FOREGROUND_SERVICE") || !permissions.has("android.permission.FOREGROUND_SERVICE_LOCATION")) {
    fail("active-trip background location requires Android foreground-service location permissions.");
  }
}

console.log(JSON.stringify({
  expo: pkg.dependencies.expo,
  reactNative: pkg.dependencies["react-native"],
  compileSdk,
  targetSdk,
  minSdk,
  applicationId: app.android.package,
  backgroundLocationDeclared,
}));
