const widget = document.getElementById("widget");
const refreshButton = document.getElementById("refresh");
const optionsButton = document.getElementById("options");
const closeButton = document.getElementById("close");
const settingsCloseButton = document.getElementById("settingsClose");
const settingsQuitButton = document.getElementById("settingsQuit");
const meters = document.getElementById("meters");
const errorPanel = document.getElementById("errorPanel");
const errorDetail = document.getElementById("errorDetail");
const primaryRemaining = document.getElementById("primaryRemaining");
const secondaryRemaining = document.getElementById("secondaryRemaining");
const primaryBar = document.getElementById("primaryBar");
const secondaryBar = document.getElementById("secondaryBar");
const primaryReset = document.getElementById("primaryReset");
const secondaryReset = document.getElementById("secondaryReset");
const statusEl = document.getElementById("status");
const updatedEl = document.getElementById("updated");
const opacityRange = document.getElementById("opacityRange");
const opacityValue = document.getElementById("opacityValue");
const resetSettingsButton = document.getElementById("resetSettings");
const resizeHandles = document.querySelectorAll("[data-resize]");
let activeInteraction = null;

refreshButton.addEventListener("click", () => {
  window.codexUsage.refresh();
});

optionsButton.addEventListener("click", () => {
  openSettings();
});

closeButton.addEventListener("click", () => {
  window.codexUsage.quit();
});

settingsCloseButton.addEventListener("click", () => {
  closeSettings();
});

settingsQuitButton.addEventListener("click", () => {
  window.codexUsage.quit();
});

opacityRange.addEventListener("input", () => {
  const opacity = clamp(opacityRange.value, 45, 100) / 100;
  renderSettings({ opacity });
  window.codexUsage.writeSettings({ opacity }).catch(() => {});
});

resetSettingsButton.addEventListener("click", () => {
  window.codexUsage.resetSettings().then(renderSettings).catch(() => {});
});

for (const handle of resizeHandles) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    startPointerInteraction(event, "resize", handle.dataset.resize);
  });
}

window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || isInteractiveTarget(event.target)) return;

  event.preventDefault();
  startPointerInteraction(event, "drag");
});

window.addEventListener("pointermove", (event) => {
  if (!activeInteraction || activeInteraction.pointerId !== event.pointerId) return;

  event.preventDefault();
  if (activeInteraction.type === "resize") {
    window.codexUsage.resizeMove();
  } else {
    window.codexUsage.dragMove();
  }
});

window.addEventListener("pointerup", endPointerInteraction);
window.addEventListener("pointercancel", endPointerInteraction);
window.addEventListener("blur", endPointerInteraction);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (widget.classList.contains("show-settings")) {
      closeSettings();
      return;
    }

    window.codexUsage.hide();
  }
});

window.codexUsage.onSettingsUpdate((settings) => {
  renderSettings(settings);
});

window.codexUsage.readSettings().then(renderSettings).catch(() => {});

window.codexUsage.onUpdate((payload) => {
  if (!payload) return;

  widget.dataset.status = payload.status;
  updatedEl.textContent = formatUpdated(payload.updatedAt, payload.source);

  if (payload.status === "loading") {
    statusEl.textContent = "갱신 중";
    showMeters();
    return;
  }

  if (payload.status === "error") {
    statusEl.textContent = "연결 필요";
    showError(payload.error);
    return;
  }

  const limits = payload.data && (payload.data.rateLimitsByLimitId?.codex || payload.data.rateLimits);
  const primary = limits?.primary;
  const secondary = limits?.secondary;

  renderWindow(primary, primaryRemaining, primaryBar, primaryReset, "5시간");
  renderWindow(secondary, secondaryRemaining, secondaryBar, secondaryReset, "1주");
  statusEl.textContent = limits?.planType ? limits.planType.toUpperCase() : "READY";
  showMeters();
});

function showMeters() {
  meters.hidden = false;
  errorPanel.hidden = true;
}

function showError(error) {
  meters.hidden = true;
  errorPanel.hidden = false;
  errorDetail.textContent = error ? `세부 오류: ${shortenError(error)}` : "";
}

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

function formatUpdated(timestamp, source) {
  const prefix = source === "event" ? "이벤트" : "갱신";
  return `${prefix} ${formatTime(timestamp)}`;
}

function shortenError(error) {
  if (!error) return "오류";
  return error.length > 28 ? `${error.slice(0, 27)}...` : error;
}

function openSettings() {
  widget.classList.add("show-settings");
}

function closeSettings() {
  widget.classList.remove("show-settings");
}

function renderSettings(settings) {
  const opacity = clamp(settings?.opacity ?? 0.95, 0.45, 1);
  const percent = Math.round(opacity * 100);
  opacityRange.value = String(percent);
  opacityValue.textContent = `${percent}%`;
}

function startPointerInteraction(event, type, direction) {
  if (activeInteraction) {
    endPointerInteraction();
  }

  const captureTarget = event.currentTarget || event.target;
  activeInteraction = {
    pointerId: event.pointerId,
    type,
    captureTarget
  };

  try {
    captureTarget.setPointerCapture?.(event.pointerId);
  } catch {
    // Some elements may not support capture after event retargeting.
  }

  if (type === "resize") {
    window.codexUsage.startResize(direction);
  } else {
    window.codexUsage.startDrag();
  }
}

function endPointerInteraction(event) {
  if (
    event &&
    Number.isFinite(event.pointerId) &&
    activeInteraction?.pointerId !== event.pointerId
  ) {
    return;
  }
  if (!activeInteraction) return;

  const endedInteraction = activeInteraction;

  if (endedInteraction.pointerId !== null) {
    try {
      endedInteraction.captureTarget?.releasePointerCapture?.(endedInteraction.pointerId);
    } catch {
      // Pointer capture may already be gone after blur/cancel.
    }
  }
  activeInteraction = null;

  if (endedInteraction.type === "resize") {
    window.codexUsage.endResize();
  } else {
    window.codexUsage.endDrag();
  }
}

function isInteractiveTarget(target) {
  return Boolean(target.closest("button, input, label, output, .resize-handle"));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
