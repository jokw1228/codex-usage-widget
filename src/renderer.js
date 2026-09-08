const widget = document.getElementById("widget");
const refreshButton = document.getElementById("refresh");
const primaryRemaining = document.getElementById("primaryRemaining");
const secondaryRemaining = document.getElementById("secondaryRemaining");
const primaryBar = document.getElementById("primaryBar");
const secondaryBar = document.getElementById("secondaryBar");
const primaryReset = document.getElementById("primaryReset");
const secondaryReset = document.getElementById("secondaryReset");
const statusEl = document.getElementById("status");
const updatedEl = document.getElementById("updated");

refreshButton.addEventListener("click", () => {
  window.codexUsage.refresh();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.codexUsage.hide();
  }
});

window.codexUsage.onCompact((compact) => {
  widget.classList.toggle("compact", compact);
});

window.codexUsage.onUpdate((payload) => {
  if (!payload) return;

  widget.dataset.status = payload.status;
  updatedEl.textContent = formatTime(payload.updatedAt);

  if (payload.status === "loading") {
    statusEl.textContent = "갱신 중";
    return;
  }

  if (payload.status === "error") {
    statusEl.textContent = "연결 실패";
    updatedEl.textContent = shortenError(payload.error);
    return;
  }

  const limits = payload.data && (payload.data.rateLimitsByLimitId?.codex || payload.data.rateLimits);
  const primary = limits?.primary;
  const secondary = limits?.secondary;

  renderWindow(primary, primaryRemaining, primaryBar, primaryReset, "5시간");
  renderWindow(secondary, secondaryRemaining, secondaryBar, secondaryReset, "1주");
  statusEl.textContent = limits?.planType ? limits.planType.toUpperCase() : "READY";
});

function renderWindow(windowData, labelEl, barEl, resetEl, label) {
  if (!windowData) {
    labelEl.textContent = "--%";
    barEl.style.width = "0%";
    resetEl.textContent = `${label} 정보 없음`;
    return;
  }

  const used = clamp(windowData.usedPercent, 0, 100);
  const remaining = 100 - used;
  labelEl.textContent = `${remaining}%`;
  barEl.style.width = `${remaining}%`;
  resetEl.textContent = formatReset(windowData.resetsAt);
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

function shortenError(error) {
  if (!error) return "오류";
  return error.length > 28 ? `${error.slice(0, 27)}...` : error;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
