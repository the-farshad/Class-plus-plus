// Class++ presentation mode. Standalone full-screen page that an
// instructor opens in a new tab to project live results during lecture.
//
// Design constraints:
//   - Reuses the existing session token from localStorage. No login UI.
//   - Auth-checks via a single /activities/admin/all probe — if it 401s,
//     the session is gone; if it 403s, the user isn't an instructor.
//   - Listens to SSE for "activities_changed" so vote tallies update in
//     real time without polling. Falls back to a 4-second poll if SSE
//     drops.
//   - Built around Chart.js for poll-family activities, and a card grid
//     for word_cloud / ordering / submission.

import { api, session, API_BASE_URL } from "/js/api.js";

const params = new URLSearchParams(location.search);
const ACTIVITY_ID = params.get("activity");

const shell      = document.getElementById("shell");
const errorScr   = document.getElementById("error-screen");
const errorTitle = document.getElementById("error-title");
const errorBody  = document.getElementById("error-body");
const promptEl   = document.getElementById("prompt");
const chartEl    = document.getElementById("chart");
const listEl     = document.getElementById("list");
const emptyEl    = document.getElementById("empty-state");
const statusPill = document.getElementById("status-pill");
const countPill  = document.getElementById("count-pill");
const updatedAt  = document.getElementById("updated-at");
const chartPicker    = document.getElementById("chart-picker");
const identityToggle = document.getElementById("identity-toggle");
const identityLabel  = document.getElementById("identity-label");

let activity = null;
let chart = null;
let pollTimer = null;
let sseSource = null;

// Available chart types for poll-family activities. `min` is the minimum
// number of options the chart needs to make sense (radar wants ≥3 axes).
const CHART_TYPES = [
  { id: "bar",       label: "Bar",     chartjs: "bar",       min: 1 },
  { id: "column",    label: "Column",  chartjs: "bar",       min: 1, vertical: true },
  { id: "doughnut",  label: "Doughnut", chartjs: "doughnut", min: 2 },
  { id: "pie",       label: "Pie",     chartjs: "pie",       min: 2 },
  { id: "polarArea", label: "Polar",   chartjs: "polarArea", min: 2 },
  { id: "radar",     label: "Radar",   chartjs: "radar",     min: 3 },
];
const IDENTITY_MODES = ["anon", "full", "hidden"];
const IDENTITY_LABELS = { anon: "Anonymized", full: "Names shown", hidden: "Names hidden" };

// Settings live in localStorage so the projector remembers preferences
// across page reloads. Chart type is per-activity (different questions
// can have different ideal charts); identity is global to the browser.
function chartKey(id) { return `classpp.present.chart.${id}`; }
function loadChartType(activityId) {
  return localStorage.getItem(chartKey(activityId)) || "bar";
}
function saveChartType(activityId, type) {
  localStorage.setItem(chartKey(activityId), type);
}
function loadIdentityMode() {
  return localStorage.getItem("classpp.present.identity") || "anon";
}
function saveIdentityMode(mode) {
  localStorage.setItem("classpp.present.identity", mode);
}

let currentChartType = "bar";
let identityMode = loadIdentityMode();

function showError(title, body) {
  errorTitle.textContent = title;
  if (body) errorBody.textContent = body;
  errorScr.hidden = false;
  shell.hidden = true;
}

function renderPrompt(text) {
  if (window.marked && window.DOMPurify) {
    promptEl.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text || ""));
  } else {
    promptEl.textContent = text || "";
  }
}

async function loadActivity() {
  if (!ACTIVITY_ID) return showError("No activity specified", "Add ?activity=<id> to the URL.");
  if (!session.token) return showError("Not signed in", "Open /instructor/ first and sign in, then come back to this tab.");

  try {
    // Use the admin list so we can fetch any activity regardless of its
    // gating (closed, scheduled, etc) — present mode doesn't care.
    const res = await api.listAllActivities();
    const row = (res.activities || []).find(a => String(a.activity_id) === String(ACTIVITY_ID));
    if (!row) return showError("Activity not found", "It may have been deleted or you're signed in to a different account.");
    activity = row;
  } catch (err) {
    if (err.status === 401) return showError("Session expired", "Sign in again at /instructor/, then reopen this page.");
    if (err.status === 403) return showError("Not authorized", "Presentation mode is for instructors only.");
    return showError("Couldn't load activity", err.message);
  }

  shell.hidden = false;
  renderPrompt(activity.prompt);
  // Mount the toolbar controls (chart picker visibility depends on activity type).
  currentChartType = loadChartType(activity.activity_id);
  mountChartPicker();
  mountIdentityToggle();
  await refresh();
  startLiveUpdates();
}

// Build the chart-type picker, filtered to types that make sense for
// this activity (option count). Visible only for poll-family activities.
function mountChartPicker() {
  const isPoll = ["poll", "poll_pie", "poll_multi"].includes(activity.type);
  if (!isPoll) { chartPicker.hidden = true; return; }
  let optCount = 0;
  try { optCount = JSON.parse(activity.poll_options || "[]").length; } catch {}
  const supported = CHART_TYPES.filter(c => optCount >= c.min);
  // If the persisted default isn't supported for this question (e.g.
  // saved "radar" on a 2-option poll), fall back to bar.
  if (!supported.find(c => c.id === currentChartType)) currentChartType = "bar";
  chartPicker.hidden = false;
  chartPicker.innerHTML = supported.map(c =>
    `<button type="button" data-type="${c.id}" class="${c.id === currentChartType ? "active" : ""}">${c.label}</button>`
  ).join("");
  chartPicker.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      currentChartType = btn.dataset.type;
      saveChartType(activity.activity_id, currentChartType);
      chartPicker.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      // Force a chart rebuild — switching types means a new Chart instance.
      if (chart) { chart.destroy(); chart = null; }
      refresh();
    });
  });
}

function mountIdentityToggle() {
  identityLabel.textContent = IDENTITY_LABELS[identityMode];
  identityToggle.addEventListener("click", cycleIdentity);
}
function cycleIdentity() {
  const i = IDENTITY_MODES.indexOf(identityMode);
  identityMode = IDENTITY_MODES[(i + 1) % IDENTITY_MODES.length];
  saveIdentityMode(identityMode);
  identityLabel.textContent = IDENTITY_LABELS[identityMode];
  // Re-render so the response list reflects the new visibility.
  if (activity && (activity.type === "word_cloud" || activity.type === "ordering" || activity.type === "submission")) {
    refresh();
  }
}

async function refresh() {
  if (!activity) return;
  try {
    if (activity.type === "poll" || activity.type === "poll_pie" || activity.type === "poll_multi") {
      await renderPollChart();
    } else if (activity.type === "word_cloud") {
      await renderResponses();
    } else {
      // ordering / submission — show the response list.
      await renderResponses();
    }
    updatedAt.textContent = "updated " + new Date().toLocaleTimeString();
  } catch (err) {
    statusPill.textContent = "Stalled";
    statusPill.classList.remove("live");
    console.error("present refresh failed", err);
  }
}

// Theme palette derived from CSS vars (presentation page is dark by default
// regardless of site theme, so we hardcode strong colors here).
const SERIES = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#fb7185", "#a3e635"];

// Build a vertical gradient fill so the leading bar feels a bit fancier
// than a flat color. Cached per-color per-canvas-height.
function makeBarGradient(ctx, baseHex) {
  const h = ctx.canvas.height || 380;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, baseHex);
  g.addColorStop(1, `${baseHex}55`);
  return g;
}

async function renderPollChart() {
  const res = await api.getResults(activity.activity_id);
  const options = res.options || [];
  const counts = options.map((_, idx) => res.votes.find(v => v.option_index === idx)?.count || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  countPill.textContent = total === 0
    ? "0 responses"
    : `${total} response${total === 1 ? "" : "s"}`;

  listEl.hidden = true;
  emptyEl.hidden = total > 0;
  chartEl.hidden = total === 0;
  if (total === 0) return;

  const ctx = chartEl.getContext("2d");

  // Pick the Chart.js type + options for the user's selected style.
  const def = CHART_TYPES.find(c => c.id === currentChartType) || CHART_TYPES[0];
  const chartjsType = def.chartjs;

  // Highlight the leader: every option in first-place gets the brand
  // color, the rest get muted variants from SERIES. Ties keep their
  // distinct colors so attendees can tell options apart.
  const max = Math.max(...counts);
  const colors = counts.map((c, i) => SERIES[i % SERIES.length]);

  // Bar/column gets vertical gradients for a fancier look; the radial
  // chart types use solid colors (Chart.js doesn't apply CanvasGradient
  // well to slices).
  const fills = (chartjsType === "bar")
    ? colors.map(c => makeBarGradient(ctx, c))
    : colors;

  const isRadial = ["pie", "doughnut", "polarArea", "radar"].includes(chartjsType);
  const isRadar  = chartjsType === "radar";
  const isVerticalBar = chartjsType === "bar" && def.vertical;

  // Tear down + rebuild whenever the chart TYPE switches (Chart.js can't
  // mutate type in place). Same-type refreshes just push new data.
  if (chart && chart._type !== chartjsType) {
    chart.destroy();
    chart = null;
  }

  const datasetCommon = {
    data: counts,
    backgroundColor: isRadar
      ? "rgba(96, 165, 250, 0.25)"
      : fills,
    borderColor: isRadar ? "#60a5fa" : (isRadial ? "#0b0f17" : "transparent"),
    borderWidth: isRadar ? 2 : (isRadial ? 3 : 0),
    borderRadius: chartjsType === "bar" ? 10 : 0,
    maxBarThickness: 80,
    hoverOffset: isRadial ? 12 : 0,
    pointBackgroundColor: isRadar ? "#60a5fa" : undefined,
    pointBorderColor: isRadar ? "#0b0f17" : undefined,
    pointRadius: isRadar ? 5 : 0,
  };

  if (!chart) {
    chart = new Chart(ctx, {
      type: chartjsType,
      data: { labels: options, datasets: [datasetCommon] },
      options: {
        indexAxis: chartjsType === "bar" && !isVerticalBar ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutQuart" },
        plugins: {
          legend: {
            display: isRadial,
            position: "right",
            labels: {
              color: "#cbd5e1",
              font: { size: 16, weight: "600" },
              padding: 14,
              generateLabels(c) {
                // Bake count + % into each legend label so attendees can
                // read the tally from the back of the room without
                // a separate count column.
                const data = c.data;
                return data.labels.map((label, i) => {
                  const n = data.datasets[0].data[i];
                  const pct = total ? Math.round(100 * n / total) : 0;
                  const bg = Array.isArray(data.datasets[0].backgroundColor)
                    ? data.datasets[0].backgroundColor[i] : data.datasets[0].backgroundColor;
                  return {
                    text: `${label}  —  ${n}  (${pct}%)`,
                    fillStyle: bg, strokeStyle: bg, index: i,
                  };
                });
              },
            },
          },
          tooltip: { enabled: false },
          datalabels: { display: false },
        },
        scales: isRadial ? (isRadar ? {
          r: {
            angleLines: { color: "rgba(148,163,184,0.18)" },
            grid: { color: "rgba(148,163,184,0.18)" },
            pointLabels: { color: "#e2e8f0", font: { size: 15, weight: "600" } },
            ticks: { color: "#94a3b8", backdropColor: "transparent", showLabelBackdrop: false, precision: 0 },
            beginAtZero: true,
          },
        } : {}) : {
          // Linear bar chart axes.
          [isVerticalBar ? "y" : "x"]: {
            beginAtZero: true,
            ticks: { color: "#94a3b8", font: { size: 14 }, precision: 0 },
            grid: { color: "rgba(148, 163, 184, 0.12)" },
          },
          [isVerticalBar ? "x" : "y"]: {
            ticks: {
              color: "#e2e8f0", font: { size: 18, weight: "600" },
              autoSkip: false,
            },
            grid: { display: false },
          },
        },
      },
    });
    chart._type = chartjsType;
  } else {
    chart.data.labels = options;
    chart.data.datasets[0].data = counts;
    chart.data.datasets[0].backgroundColor = isRadar ? "rgba(96, 165, 250, 0.25)" : fills;
    chart.update();
  }
  // Suppress linter on unused locals captured above (used in dataset).
  void max;
}

async function renderResponses() {
  // Word-cloud / ordering / submission don't have a tally endpoint we
  // can hit as a flat counts array, so we fall back to the per-activity
  // submissions list (instructor-only endpoint).
  chartEl.hidden = true;
  listEl.hidden = false;
  emptyEl.hidden = true;

  try {
    const res = await fetch(`${API_BASE_URL}/submissions/by-activity/${activity.activity_id}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const rows = data.submissions || [];
    countPill.textContent = `${rows.length} response${rows.length === 1 ? "" : "s"}`;
    listEl.innerHTML = "";
    if (!rows.length) {
      emptyEl.hidden = false;
      listEl.hidden = true;
      return;
    }
    // Newest first, cap to ~24 cards so the grid stays presentable.
    rows.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, 24).forEach(r => {
      const card = document.createElement("div");
      card.className = "present-list-card";
      // Identity row honors the current visibility mode (full / anon / hidden).
      const whoText = formatResponder(r.email, identityMode);
      if (whoText) {
        const who = document.createElement("div");
        who.className = "who";
        who.textContent = whoText;
        card.appendChild(who);
      }
      const body = document.createElement("div");
      body.textContent = r.response;
      card.appendChild(body);
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error("renderResponses failed", err);
    listEl.innerHTML = `<div class="present-list-card">Couldn't load responses: ${err.message}</div>`;
  }
}

function anonymize(email) {
  // Show "f.gh…@uwyo.edu" rather than full identities on the projector.
  if (!email || !email.includes("@")) return email || "anonymous";
  const [local, domain] = email.split("@");
  const head = local.slice(0, Math.min(3, local.length));
  return `${head}…@${domain}`;
}

function formatResponder(email, mode) {
  if (mode === "hidden") return "";
  if (mode === "full")   return email || "anonymous";
  return anonymize(email);
}

function startLiveUpdates() {
  // SSE for push updates; gentle 5s poll as fallback if SSE drops.
  try {
    sseSource = new EventSource(`${API_BASE_URL}/activities/events`);
    sseSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "activities_changed") refresh();
      } catch {}
    };
    sseSource.onerror = () => { sseSource?.close(); sseSource = null; };
  } catch {}
  pollTimer = setInterval(refresh, 5000);
}

// Keyboard shortcuts:
//   F        toggle fullscreen
//   R        force refresh
//   Esc      exit fullscreen
//   A        cycle identity (full → anon → hidden)
//   1..6     pick chart type (matches the chart-picker buttons left→right)
document.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input, textarea")) return;
  if (e.key === "f" || e.key === "F") {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  } else if (e.key === "r" || e.key === "R") {
    refresh();
  } else if (e.key === "a" || e.key === "A") {
    cycleIdentity();
  } else if (e.key === "Escape") {
    if (document.fullscreenElement) document.exitFullscreen?.();
  } else if (/^[1-6]$/.test(e.key)) {
    // Click the corresponding chart-picker button if present.
    const btn = chartPicker?.querySelectorAll("button")[parseInt(e.key, 10) - 1];
    btn?.click();
  }
});

loadActivity();
