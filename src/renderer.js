import {
  selectUsageLimits,
  getUsageWindows,
  formatLimitSource,
  formatWindowDuration,
  formatReset,
  formatUpdated,
  shortenError
} from "./ui/usage.mjs";

const widget = document.getElementById("widget");
const refreshButton = document.getElementById("refresh");
const optionsButton = document.getElementById("options");
const closeButton = document.getElementById("close");
const settingsCloseButton = document.getElementById("settingsClose");
const settingsQuitButton = document.getElementById("settingsQuit");
const meters = document.getElementById("meters");
const errorPanel = document.getElementById("errorPanel");
const errorDetail = document.getElementById("errorDetail");
const limitSource = document.getElementById("limitSource");
const primaryLabel = document.getElementById("primaryLabel");
const secondaryLabel = document.getElementById("secondaryLabel");
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
const meterSlots = [
  {
    meter: primaryLabel.closest(".meter"),
    label: primaryLabel,
    remaining: primaryRemaining,
    bar: primaryBar,
    reset: primaryReset
  },
  {
    meter: secondaryLabel.closest(".meter"),
    label: secondaryLabel,
    remaining: secondaryRemaining,
    bar: secondaryBar,
    reset: secondaryReset
  }
];
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
    limitSource.textContent = "한도 확인 중";
    showMeters();
    return;
  }

  if (payload.status === "error") {
    statusEl.textContent = "연결 필요";
    showError(payload.error);
    return;
  }

  const selectedLimits = selectUsageLimits(payload.data);
  const windows = getUsageWindows(selectedLimits);

  renderWindows(windows);
  limitSource.textContent = formatLimitSource(selectedLimits);
  statusEl.textContent = selectedLimits?.limits?.planType
    ? selectedLimits.limits.planType.toUpperCase()
    : "READY";
  showMeters();
});

function showMeters() {
  meters.hidden = false;
  errorPanel.hidden = true;
}

function showError(error) {
  meters.hidden = true;
  errorPanel.hidden = false;
  limitSource.textContent = "Codex 연결 필요";
  errorDetail.textContent = error ? `세부 오류: ${shortenError(error)}` : "";
}

function renderWindows(windows) {
  for (const [index, slot] of meterSlots.entries()) {
    const windowData = windows[index];

    if (!windowData) {
      slot.meter.hidden = true;
      continue;
    }

    slot.meter.hidden = false;
    renderWindow(windowData, slot);
  }
}

function renderWindow(windowData, slot) {
  slot.label.textContent = formatWindowDuration(windowData.windowDurationMins);

  if (!Number.isFinite(Number(windowData.usedPercent))) {
    slot.remaining.textContent = "--%";
    slot.bar.style.width = "0%";
    slot.reset.textContent = "사용량 정보 없음";
    return;
  }

  const used = clamp(windowData.usedPercent, 0, 100);
  const remaining = 100 - used;
  slot.remaining.textContent = `${remaining}%`;
  slot.bar.style.width = `${remaining}%`;
  slot.reset.textContent = formatReset(windowData.resetsAt);
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
