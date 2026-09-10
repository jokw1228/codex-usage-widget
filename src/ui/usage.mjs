function listUsageLimits(data) {
  const byId = new Map();
  for (const [id, limits] of Object.entries(data?.rateLimitsByLimitId || {})) {
    if (limits && typeof limits === "object") byId.set(id, { id, limits });
  }

  // The legacy snapshot can duplicate a named bucket; prefer the named snapshot.
  const fallback = data?.rateLimits;
  if (fallback && typeof fallback === "object") {
    const id = fallback.limitId || "codex";
    if (!byId.has(id)) byId.set(id, { id, limits: fallback });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.id === "codex") return -1;
    if (b.id === "codex") return 1;
    return a.id.localeCompare(b.id);
  });
}

function selectUsageLimits(data, selectedId = "codex") {
  const candidates = listUsageLimits(data);
  return candidates.find((candidate) => candidate.id === selectedId)
    ?? candidates.find((candidate) => candidate.id === "codex")
    ?? candidates[0]
    ?? null;
}

function formatLimitLabel(candidate) {
  if (candidate.id === "codex") return "기본";
  return candidate.limits.limitName || candidate.id;
}

function getRemainingPercent(windowData) {
  const used = windowData?.usedPercent;
  if (used === null || used === undefined || used === "" || typeof used === "boolean") return null;
  const value = Number(used);
  if (!Number.isFinite(value)) return null;
  return Math.round((100 - Math.min(100, Math.max(0, value))) * 10) / 10;
}

function getUsageWindows(candidate) {
  const limits = candidate?.limits ?? candidate;
  if (!limits) return [];

  return [limits.primary, limits.secondary]
    .filter(Boolean)
    .sort((a, b) => (a.windowDurationMins || 0) - (b.windowDurationMins || 0));
}

function formatLimitSource(candidate) {
  const limits = candidate?.limits;
  if (!limits) return "사용량 정보 없음";

  if (candidate.id === "codex") return "Codex 기본 한도";
  if (limits.limitName) return `${limits.limitName} 기준`;
  if (candidate.id && candidate.id !== "rateLimits") return `${candidate.id} 기준`;
  return "기본 한도 기준";
}

function formatWindowDuration(minutes) {
  if (!minutes) return "한도";
  if (minutes === 300) return "5시간";
  if (minutes === 10080) return "1주";
  if (minutes % 10080 === 0) return `${minutes / 10080}주`;
  if (minutes % 1440 === 0) return `${minutes / 1440}일`;
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}

function formatReset(seconds) {
  if (!seconds) return "리셋 시간 없음";

  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.getTime())) return "리셋 시간 없음";
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const datePart = isToday
    ? "오늘"
    : new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
  const timePart = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);

  return `${datePart} ${timePart}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "--:--";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function formatUpdated(timestamp, source) {
  const prefix = source === "event" ? "이벤트" : "갱신";
  return `${prefix} ${formatTime(timestamp)}`;
}

function shortenError(error) {
  if (!error) return "오류";
  return error.length > 28 ? `${error.slice(0, 27)}...` : error;
}


export {
  listUsageLimits, selectUsageLimits, formatLimitLabel, getRemainingPercent,
  getUsageWindows, formatLimitSource,
  formatWindowDuration, formatReset, formatUpdated, shortenError
};
