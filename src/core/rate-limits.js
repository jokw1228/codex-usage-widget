function mergeRateLimitPayload(previous, update) {
  if (!previous) return update;
  if (!update) return previous;

  return {
    ...previous,
    ...update,
    rateLimits: mergeRateLimitSnapshot(previous.rateLimits, update.rateLimits),
    rateLimitsByLimitId: mergeRateLimitsById(
      previous.rateLimitsByLimitId,
      update.rateLimitsByLimitId
    )
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
  if (!previous) return update;
  if (!update) return previous;

  return {
    ...previous,
    ...update,
    primary: update.primary ? { ...previous.primary, ...update.primary } : previous.primary,
    secondary: update.secondary ? { ...previous.secondary, ...update.secondary } : previous.secondary,
    credits: update.credits ? { ...previous.credits, ...update.credits } : previous.credits,
    individualLimit: update.individualLimit
      ? { ...previous.individualLimit, ...update.individualLimit }
      : previous.individualLimit
  };
}


module.exports = { mergeRateLimitPayload };
