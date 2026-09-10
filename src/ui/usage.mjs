function selectUsageLimits(data) {
  if (!data) return null;

  const byId = data.rateLimitsByLimitId || {};
  const candidates = Object.entries(byId).map(([id, limits]) => ({ id, limits }));

  if (data.rateLimits) {
    candidates.push({ id: "rateLimits", limits: data.rateLimits });
  }

  if (candidates.length === 0) return null;

  return candidates
    .filter((candidate) => candidate.limits)
    .sort((a, b) => scoreUsageLimits(b) - scoreUsageLimits(a))[0] ?? null;
}

function scoreUsageLimits(candidate) {
  const limits = candidate.limits;
  const windowCount = getUsageWindows(candidate).length;
  let score = 0;

  score += windowCount * 30;
  if (windowCount >= 2) score += 40;
  if (candidate.id !== "codex" && candidate.id !== "rateLimits") score += 10;
  if (limits.primary?.windowDurationMins === 300) score += 10;
  if (limits.secondary?.windowDurationMins === 10080) score += 10;

  return score;
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
  selectUsageLimits, getUsageWindows, formatLimitSource,
  formatWindowDuration, formatReset, formatUpdated, shortenError
};
