const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const publicDir = path.join(__dirname, "public");
const scripts = fs
  .readdirSync(publicDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => path.join("public", entry.name))
  .sort();

if (scripts.length === 0) {
  throw new Error("No public JavaScript files found to validate.");
}

for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", script], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Validated ${scripts.length} Ops public JavaScript files.`);
