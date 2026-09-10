function mergeRateLimitPayload(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  let byId = { ...previous.rateLimitsByLimitId };
  if (previous.rateLimits) {
    const id = previous.rateLimits.limitId || "codex";
    if (!Object.prototype.hasOwnProperty.call(byId, id)) byId[id] = previous.rateLimits;
  }
  // A single-limit event must also update the named bucket used by the tabs.
  if (update.rateLimits) {
    const id = update.rateLimits.limitId || "codex";
    byId[id] = mergeRateLimitSnapshot(byId[id], update.rateLimits);
  }
  byId = mergeRateLimitsById(byId, update.rateLimitsByLimitId);
  const legacy = update.rateLimits === undefined ? previous.rateLimits : update.rateLimits;

  return {
    ...previous,
    ...update,
    rateLimits: legacy ? byId[legacy.limitId || "codex"] : legacy,
    rateLimitsByLimitId: byId
  };
}

function mergeRateLimitsById(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  const merged = { ...previous };
  for (const [limitId, snapshot] of Object.entries(update)) {
    merged[limitId] = mergeRateLimitSnapshot(previous[limitId], snapshot);
  }
  return merged;
}

function mergeRateLimitSnapshot(previous, update) {
  if (update === undefined) return previous;
  if (update === null) return null;
  if (!previous) return update;

  const merged = { ...previous, ...update };
  for (const key of ["primary", "secondary", "credits", "individualLimit"]) {
    if (update[key] && typeof update[key] === "object") {
      merged[key] = { ...previous[key], ...update[key] };
    }
  }
  return merged;
}


module.exports = { mergeRateLimitPayload };
