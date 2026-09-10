import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getResizedBounds, normalizeWindowBounds } from "../src/core/window-bounds.js";
import { createSettingsStore, DEFAULT_SETTINGS } from "../src/core/settings-store.js";
import { mergeRateLimitPayload } from "../src/core/rate-limits.js";
import {
  listUsageLimits, selectUsageLimits, getUsageWindows, getRemainingPercent,
  formatWindowDuration, formatLimitSource, formatLimitLabel
} from "../src/ui/usage.mjs";

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

test("the default weekly allowance is selected even when Spark has two unused windows", () => {
  const codex = { primary: { usedPercent: 5, windowDurationMins: 10080 }, secondary: null };
  const model = {
    limitName: "GPT-5.3-Codex-Spark",
    primary: { usedPercent: 0, windowDurationMins: 300 },
    secondary: { usedPercent: 0, windowDurationMins: 10080 }
  };
  const selected = selectUsageLimits({
    rateLimits: codex,
    rateLimitsByLimitId: { codex, codex_bengalfox: model }
  });
  assert.deepEqual(selected, { id: "codex", limits: codex });
  assert.equal(100 - getUsageWindows(selected)[0].usedPercent, 95);
  assert.equal(getUsageWindows(selected).length, 1);
  assert.equal(formatLimitSource(selected), "Codex 기본 한도");
});

test("legacy limits keep their identity even when only a separate limit is available", () => {
  const fallback = { primary: { usedPercent: 12, windowDurationMins: 300 } };
  assert.deepEqual(selectUsageLimits({ rateLimits: fallback }), { id: "codex", limits: fallback });
  const spark = { limitId: "codex_bengalfox", ...fallback };
  assert.deepEqual(selectUsageLimits({
    rateLimits: spark,
    rateLimitsByLimitId: { codex_bengalfox: spark }
  }), { id: "codex_bengalfox", limits: spark });
});

test("tabs list every named limit once, with the default first", () => {
  const data = {
    rateLimits: { limitId: "codex", primary: { usedPercent: 0 } },
    rateLimitsByLimitId: {
      future: { limitName: "Another limit" },
      codex_bengalfox: { limitName: "GPT-5.3-Codex-Spark" },
      codex: { primary: { usedPercent: 5 } },
      unavailable: null
    }
  };
  assert.deepEqual(listUsageLimits(data).map(({ id }) => id), ["codex", "codex_bengalfox", "future"]);
  assert.equal(listUsageLimits(data)[0].limits.primary.usedPercent, 5);
  assert.equal(formatLimitLabel(listUsageLimits(data)[0]), "기본");
  assert.equal(formatLimitLabel(listUsageLimits(data)[1]), "GPT-5.3-Codex-Spark");
  assert.equal(selectUsageLimits(data, "future").id, "future");
  assert.equal(selectUsageLimits(data, "removed").id, "codex");
  assert.deepEqual(listUsageLimits(null), []);
});

test("unknown usage is not rendered as 100 percent remaining", () => {
  for (const usedPercent of [null, undefined, "", false, "invalid", NaN]) {
    assert.equal(getRemainingPercent({ usedPercent }), null);
  }
  assert.equal(getRemainingPercent({ usedPercent: 0 }), 100);
  assert.equal(getRemainingPercent({ usedPercent: 5 }), 95);
  assert.equal(getRemainingPercent({ usedPercent: 25.25 }), 74.8);
  assert.equal(getRemainingPercent({ usedPercent: 101 }), 0);
});

test("single-limit events update only the corresponding tab", () => {
  const previous = {
    rateLimits: { limitId: "codex", primary: { usedPercent: 5, windowDurationMins: 10080 } },
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 5, windowDurationMins: 10080 } },
      spark: { limitId: "spark", primary: { usedPercent: 0, windowDurationMins: 300 } }
    }
  };
  const first = mergeRateLimitPayload(previous, {
    rateLimits: { limitId: "codex", primary: { usedPercent: 6 } }
  });
  assert.equal(selectUsageLimits(first).limits.primary.usedPercent, 6);
  const second = mergeRateLimitPayload(first, {
    rateLimits: { limitId: "spark", primary: { usedPercent: 10 } }
  });
  assert.equal(selectUsageLimits(second).limits.primary.usedPercent, 6);
  assert.equal(selectUsageLimits(second, "spark").limits.primary.usedPercent, 10);
  assert.equal(selectUsageLimits(second, "spark").limits.primary.windowDurationMins, 300);
  assert.equal(previous.rateLimitsByLimitId.codex.primary.usedPercent, 5);
});

test("explicit null removes an obsolete window or limit instead of restoring old data", () => {
  const previous = {
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 5 }, secondary: { usedPercent: 10 } },
      spark: { primary: { usedPercent: 0 } }
    }
  };
  const merged = mergeRateLimitPayload(previous, {
    rateLimitsByLimitId: { codex: { secondary: null }, spark: null }
  });
  assert.equal(getUsageWindows(selectUsageLimits(merged)).length, 1);
  assert.deepEqual(listUsageLimits(merged).map(({ id }) => id), ["codex"]);
});

test("the named Codex bucket takes precedence over the legacy snapshot", () => {
  const codex = { primary: { usedPercent: 5, windowDurationMins: 10080 } };
  assert.deepEqual(selectUsageLimits({
    rateLimits: { primary: { usedPercent: 0 } },
    rateLimitsByLimitId: { codex }
  }), { id: "codex", limits: codex });
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
