import {
  listUsageLimits,
  selectUsageLimits,
  formatLimitLabel,
  getRemainingPercent,
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
const limitTabs = document.getElementById("limitTabs");
const usagePanel = document.getElementById("usagePanel");
const emptyState = document.getElementById("emptyState");
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
let currentData = null;
let selectedLimitId = "codex";
let tabSignature = "";

limitTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (tab) selectLimit(tab.dataset.limitId);
});

limitTabs.addEventListener("keydown", (event) => {
  const tabs = [...limitTabs.querySelectorAll("[role=tab]")];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  let next;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  selectLimit(tabs[next].dataset.limitId);
  tabs[next].focus();
});

function selectLimit(id) {
  selectedLimitId = id;
  renderUsage();
  usagePanel.scrollTop = 0;
}

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
  if (event.button !== 0 || isInteractiveTarget(event.target) || isScrollbarTarget(event)) return;

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

  if (payload.status === "loading") {
    statusEl.textContent = "갱신 중";
    if (!currentData) {
      limitSource.textContent = "한도 확인 중";
      renderWindows([]);
    }
    return;
  }

  if (payload.status === "error") {
    statusEl.textContent = "연결 필요";
    showError(payload.error);
    return;
  }

  currentData = payload.data;
  updatedEl.textContent = formatUpdated(payload.updatedAt, payload.source);
  renderUsage();
});

function renderUsage() {
  const candidates = listUsageLimits(currentData);
  const selectedLimits = selectUsageLimits(currentData, selectedLimitId);
  selectedLimitId = selectedLimits?.id ?? "codex";
  renderLimitTabs(candidates);
  const windows = getUsageWindows(selectedLimits);

  renderWindows(windows);
  limitSource.textContent = formatLimitSource(selectedLimits);
  limitSource.title = limitSource.textContent;
  const planType = currentData?.rateLimits?.planType
    ?? currentData?.rateLimitsByLimitId?.codex?.planType
    ?? selectedLimits?.limits?.planType;
  statusEl.textContent = planType ? String(planType).toUpperCase() : "READY";
  emptyState.hidden = windows.length > 0;
  emptyState.textContent = selectedLimits
    ? "이 한도의 기간별 사용량 정보가 제공되지 않았습니다."
    : "조회 가능한 사용량 한도가 없습니다.";
  showMeters();
}

function renderLimitTabs(candidates) {
  const signature = JSON.stringify(candidates.map((candidate) => [candidate.id, formatLimitLabel(candidate)]));
  if (signature !== tabSignature) {
    const tabs = candidates.map((candidate, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "limit-tab";
      tab.id = `limit-tab-${index}`;
      tab.dataset.limitId = candidate.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "usagePanel");
      tab.textContent = formatLimitLabel(candidate);
      tab.title = formatLimitSource(candidate);
      return tab;
    });
    limitTabs.replaceChildren(...tabs);
    tabSignature = signature;
  }
  limitTabs.hidden = candidates.length < 2;
  usagePanel.setAttribute("role", candidates.length > 1 ? "tabpanel" : "region");
  usagePanel.removeAttribute("aria-labelledby");
  for (const tab of limitTabs.children) {
    const selected = tab.dataset.limitId === selectedLimitId;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && !limitTabs.hidden) usagePanel.setAttribute("aria-labelledby", tab.id);
  }
}

function showMeters() {
  meters.hidden = false;
  errorPanel.hidden = true;
}

function showError(error) {
  meters.hidden = true;
  errorPanel.hidden = false;
  emptyState.hidden = true;
  limitTabs.hidden = true;
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

  const remaining = getRemainingPercent(windowData);
  if (remaining === null) {
    slot.remaining.textContent = "--%";
    slot.bar.style.width = "0%";
    slot.reset.textContent = "사용량 정보 없음";
    return;
  }

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
  return Boolean(target.closest("button, input, label, output, .limit-tabs, .resize-handle"));
}

function isScrollbarTarget(event) {
  const target = event.target;
  if (!target.matches(".usage-panel, .card-back")) return false;
  const contentRight = target.getBoundingClientRect().left + target.clientLeft + target.clientWidth;
  return target.scrollHeight > target.clientHeight && event.clientX >= contentRight;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
