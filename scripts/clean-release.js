const fs = require("fs");
const path = require("path");

const phase = process.argv[2];
const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");

if (phase !== "before" && phase !== "after") {
  throw new Error("Usage: node scripts/clean-release.js <before|after>");
}

ensureInsideRoot(releaseDir);

if (phase === "before") {
  retry(() => fs.rmSync(releaseDir, { recursive: true, force: true }));
  retry(() => fs.mkdirSync(releaseDir, { recursive: true }));
  process.exit(0);
}

if (!fs.existsSync(releaseDir)) {
  process.exit(0);
}

for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
  const entryPath = path.join(releaseDir, entry.name);
  ensureInsideRoot(entryPath);

  if (entry.isFile() && /^codex-usage-widget-\d+\.\d+\.\d+-portable-x64\.exe$/.test(entry.name)) {
    continue;
  }

  retry(() => fs.rmSync(entryPath, { recursive: true, force: true }));
}

function ensureInsideRoot(targetPath) {
  const relative = path.relative(root, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch path outside project: ${targetPath}`);
  }
}

function retry(operation) {
  let lastError;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      lastError = error;
      sleep(250);
    }
  }

  throw lastError;
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
