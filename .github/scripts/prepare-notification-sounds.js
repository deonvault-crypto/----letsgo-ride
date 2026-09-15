const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE_SHA = "c086d898c8bd618bd696c5a691d8796bb7e79448";
const repoRoot = path.resolve(__dirname, "../..");
const mobileRoot = path.join(repoRoot, "mobile");
const helperPath = __filename;
const ciPath = ".github/workflows/platform-v2-ci.yml";

const run = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const expectedHashes = {
  "letsgoride_notification.wav": "6fa6a8261426ce2ee9e440ea3fbdac1e72356bc365b18c19c568ca87c77a354d",
  "letsgoride_ride_request.wav": "3125d56277631803dcc11d18788c725f30c6c6763e9a1ff7d58f12f413a3811e",
  "letsgoride_courier_request.wav": "c84ab4da43695325da5cc5cbb8224af8061ef6acdc28945d3324ba2eda3db428",
};

require(path.join(mobileRoot, "scripts/generate-notification-sounds.js"));
for (const [fileName, expectedHash] of Object.entries(expectedHashes)) {
  const filePath = path.join(mobileRoot, "assets/sounds", fileName);
  const bytes = fs.readFileSync(filePath);
  const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`${fileName} hash mismatch: ${actualHash}`);
}

const appConfigPath = path.join(mobileRoot, "app.config.js");
let appConfig = fs.readFileSync(appConfigPath, "utf8");
const oldConfigPrefix = `const path = require("path");\n\nmodule.exports = ({ config }) => {\n  // Generate small original notification WAV assets before Expo applies native\n  // notification plugins or EAS packages the project. This keeps the sounds\n  // deterministic and avoids shipping third-party/copyrighted ringtone assets.\n  require(path.resolve(__dirname, "scripts/generate-notification-sounds.js"));\n\n`;
if (!appConfig.startsWith(oldConfigPrefix)) throw new Error("Expected app.config.js generator prefix not found");
appConfig = appConfig.replace(oldConfigPrefix, "module.exports = ({ config }) => {\n");
fs.writeFileSync(appConfigPath, appConfig);
if (appConfig.includes("generate-notification-sounds.js")) throw new Error("Config-time generator reference remains");

const packagePath = path.join(mobileRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (pkg.scripts["generate:notification-sounds"]) throw new Error("Generation script already exists unexpectedly");
const scripts = {};
for (const [name, command] of Object.entries(pkg.scripts)) {
  scripts[name] = command;
  if (name === "verify:release") scripts["generate:notification-sounds"] = "node scripts/generate-notification-sounds.js";
}
if (!scripts["generate:notification-sounds"]) throw new Error("verify:release insertion point was not found");
pkg.scripts = scripts;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const testPath = path.join(mobileRoot, "__tests__/notification-sound-routing.test.ts");
let testSource = fs.readFileSync(testPath, "utf8");
if (!testSource.startsWith('import fs from "fs";')) throw new Error("Unexpected notification sound test imports");
testSource = `import crypto from "crypto";\n${testSource}`;
const oldTest = `  it("bundles three original LetsGoRide sounds during native builds", () => {\n    expect(appConfig).toContain("generate-notification-sounds.js");\n    expect(generator).toContain('"letsgoride_notification.wav"');\n    expect(generator).toContain('"letsgoride_ride_request.wav"');\n    expect(generator).toContain('"letsgoride_courier_request.wav"');\n    expect(appJson).toContain("./assets/sounds/letsgoride_notification.wav");\n    expect(appJson).toContain("./assets/sounds/letsgoride_ride_request.wav");\n    expect(appJson).toContain("./assets/sounds/letsgoride_courier_request.wav");\n  });\n`;
const newTest = `  it("bundles three committed original LetsGoRide sounds without config-time filesystem writes", () => {\n    const soundHashes: Record<string, string> = {\n      "letsgoride_notification.wav": "6fa6a8261426ce2ee9e440ea3fbdac1e72356bc365b18c19c568ca87c77a354d",\n      "letsgoride_ride_request.wav": "3125d56277631803dcc11d18788c725f30c6c6763e9a1ff7d58f12f413a3811e",\n      "letsgoride_courier_request.wav": "c84ab4da43695325da5cc5cbb8224af8061ef6acdc28945d3324ba2eda3db428",\n    };\n\n    expect(appConfig).not.toContain("generate-notification-sounds.js");\n    expect(generator).toContain('"letsgoride_notification.wav"');\n    expect(generator).toContain('"letsgoride_ride_request.wav"');\n    expect(generator).toContain('"letsgoride_courier_request.wav"');\n\n    for (const [fileName, expectedHash] of Object.entries(soundHashes)) {\n      const assetPath = path.join(mobileRoot, "assets", "sounds", fileName);\n      const wav = fs.readFileSync(assetPath);\n      expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");\n      expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");\n      expect(crypto.createHash("sha256").update(wav).digest("hex")).toBe(expectedHash);\n      expect(appJson).toContain(\`./assets/sounds/\${fileName}\`);\n    }\n  });\n`;
if (!testSource.includes(oldTest)) throw new Error("Expected notification sound test block not found");
testSource = testSource.replace(oldTest, newTest);
fs.writeFileSync(testPath, testSource);

run(["checkout", BASE_SHA, "--", ciPath]);
fs.rmSync(helperPath);
run(["add", "-A"]);

const changed = run(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean).sort();
const expectedChanged = [
  ".github/scripts/prepare-notification-sounds.js",
  ".github/workflows/platform-v2-ci.yml",
  "mobile/__tests__/notification-sound-routing.test.ts",
  "mobile/app.config.js",
  "mobile/assets/sounds/letsgoride_courier_request.wav",
  "mobile/assets/sounds/letsgoride_notification.wav",
  "mobile/assets/sounds/letsgoride_ride_request.wav",
  "mobile/package.json",
].sort();
if (JSON.stringify(changed) !== JSON.stringify(expectedChanged)) {
  throw new Error(`Unexpected staged files: ${JSON.stringify(changed)}`);
}
run([
  "diff", "--cached", "--check", "--",
  "mobile/__tests__/notification-sound-routing.test.ts",
  "mobile/app.config.js",
  "mobile/package.json",
]);
run(["config", "user.name", "github-actions[bot]"]);
run(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
run(["commit", "-m", "refactor(mobile): commit deterministic notification sounds"]);
run(["push", "origin", "HEAD:cleanup/committed-notification-sounds"]);
