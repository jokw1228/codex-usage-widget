const DEFAULT_BOUNDS = {
  width: 382,
  height: 220
};
const MIN_BOUNDS = {
  width: 300,
  height: 160
};

function normalizeWindowBounds(value) {
  if (!value || typeof value !== "object") return null;

  const width = Math.round(clamp(value.width, MIN_BOUNDS.width, 1600));
  const height = Math.round(clamp(value.height, MIN_BOUNDS.height, 1000));
  const bounds = { width, height };

  if (Number.isFinite(Number(value.x))) {
    bounds.x = Math.round(Number(value.x));
  }
  if (Number.isFinite(Number(value.y))) {
    bounds.y = Math.round(Number(value.y));
  }

  return bounds;
}

function getResizedBounds(startBounds, direction, deltaX, deltaY) {
  const right = startBounds.x + startBounds.width;
  const bottom = startBounds.y + startBounds.height;
  const bounds = { ...startBounds };

  if (direction.includes("e")) {
    bounds.width = Math.max(MIN_BOUNDS.width, startBounds.width + deltaX);
  }
  if (direction.includes("s")) {
    bounds.height = Math.max(MIN_BOUNDS.height, startBounds.height + deltaY);
  }
  if (direction.includes("w")) {
    bounds.width = Math.max(MIN_BOUNDS.width, startBounds.width - deltaX);
    bounds.x = right - bounds.width;
  }
  if (direction.includes("n")) {
    bounds.height = Math.max(MIN_BOUNDS.height, startBounds.height - deltaY);
    bounds.y = bottom - bounds.height;
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

function clamp(value, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return min;
  return Math.min(max, Math.max(min, numericValue));
}


module.exports = { DEFAULT_BOUNDS, MIN_BOUNDS, normalizeWindowBounds, getResizedBounds, clamp };
