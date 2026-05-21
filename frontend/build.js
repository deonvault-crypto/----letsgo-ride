const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const buildDir = path.join(__dirname, "build");

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const from = path.join(src, item);
    const to = path.join(dest, item);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

copyDir(publicDir, buildDir);
console.log("LetsGoRide static website built successfully.");
