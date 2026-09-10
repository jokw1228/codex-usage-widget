import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getResizedBounds, normalizeWindowBounds } from "../src/core/window-bounds.js";
import { createSettingsStore, DEFAULT_SETTINGS } from "../src/core/settings-store.js";
import { mergeRateLimitPayload } from "../src/core/rate-limits.js";
import { selectUsageLimits, getUsageWindows, formatWindowDuration } from "../src/ui/usage.mjs";

test("resize keeps the opposite edge anchored and respects minimum dimensions", () => {
  const start = { x: 100, y: 200, width: 382, height: 220 };
  for (const direction of ["n", "e", "s", "w", "ne", "se", "sw", "nw"]) {
    const result = getResizedBounds(start, direction, 500, 500);
    assert.ok(result.width >= 300);
    assert.ok(result.height >= 160);
    if (direction.includes("w")) assert.equal(result.x + result.width, 482);
    else assert.equal(result.x, start.x);
    if (direction.includes("n")) assert.equal(result.y + result.height, 420);
    else assert.equal(result.y, start.y);
  }
  assert.deepEqual(start, { x: 100, y: 200, width: 382, height: 220 });
});

test("a stationary pointer does not accumulate size changes", () => {
  const start = { x: -100, y: 20, width: 382, height: 220 };
  for (let count = 0; count < 100; count += 1) {
    assert.deepEqual(getResizedBounds(start, "se", 10, 20), {
      x: -100, y: 20, width: 392, height: 240
    });
  }
  assert.deepEqual(normalizeWindowBounds(start), start);
});

test("settings round-trip retains position, dimensions, and opacity", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settingsPath = path.join(directory, "settings.json");
  const store = createSettingsStore(settingsPath);
  assert.deepEqual(store.load(), DEFAULT_SETTINGS);
  const saved = store.save({
    opacity: 0.7,
    windowBounds: { x: -300, y: 50, width: 420, height: 260 }
  });
  assert.deepEqual(createSettingsStore(settingsPath).load(), saved);
  fs.writeFileSync(settingsPath, "invalid json");
  assert.deepEqual(store.load(), DEFAULT_SETTINGS);
});

test("unwritable settings retain their normalized live values", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-widget-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createSettingsStore(directory);
  assert.equal(store.save({ opacity: 0.8 }).opacity, 0.8);
  assert.equal(store.save({ opacity: 0.1 }).opacity, 0.45);
});

test("single weekly and two-window responses retain their duration labels", () => {
  const weekly = { usedPercent: 20, windowDurationMins: 10080 };
  const hourly = { usedPercent: 10, windowDurationMins: 300 };
  for (const planType of ["plus", "pro", "prolite"]) {
    const selected = selectUsageLimits({ rateLimits: { primary: weekly, planType } });
    assert.deepEqual(getUsageWindows(selected), [weekly]);
    assert.equal(formatWindowDuration(getUsageWindows(selected)[0].windowDurationMins), "1주");
  }
  assert.deepEqual(getUsageWindows({ primary: weekly, secondary: hourly }), [hourly, weekly]);
  assert.equal(formatWindowDuration(300), "5시간");
  assert.equal(selectUsageLimits(null), null);
  assert.deepEqual(getUsageWindows(null), []);
});

test("existing model-specific selection remains stable", () => {
  const codex = { primary: { windowDurationMins: 10080 }, secondary: null };
  const model = {
    limitName: "Model-specific limit",
    primary: { windowDurationMins: 300 },
    secondary: { windowDurationMins: 10080 }
  };
  assert.deepEqual(selectUsageLimits({
    rateLimits: codex,
    rateLimitsByLimitId: { codex, model }
  }), { id: "model", limits: model });
});

test("partial usage events preserve other limits without mutating the snapshot", () => {
  const previous = {
    rateLimitsByLimitId: {
      codex: {
        primary: { usedPercent: 10, windowDurationMins: 300 },
        secondary: { usedPercent: 20, windowDurationMins: 10080 }
      },
      model: { primary: { usedPercent: 30 } }
    }
  };
  const merged = mergeRateLimitPayload(previous, {
    rateLimitsByLimitId: { codex: { primary: { usedPercent: 15 } } }
  });
  assert.equal(merged.rateLimitsByLimitId.codex.primary.usedPercent, 15);
  assert.equal(merged.rateLimitsByLimitId.codex.primary.windowDurationMins, 300);
  assert.equal(merged.rateLimitsByLimitId.codex.secondary.usedPercent, 20);
  assert.deepEqual(merged.rateLimitsByLimitId.model, previous.rateLimitsByLimitId.model);
  assert.equal(previous.rateLimitsByLimitId.codex.primary.usedPercent, 10);
});
