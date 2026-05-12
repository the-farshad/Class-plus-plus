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

let activity = null;
let chart = null;
let pollTimer = null;
let sseSource = null;

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
  await refresh();
  startLiveUpdates();
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
  // Poll-pie uses a doughnut for at-a-glance percentages; everything
  // else gets a horizontal bar chart with the option text as labels.
  const isPie = activity.type === "poll_pie";

  if (chart && chart._type !== (isPie ? "doughnut" : "bar")) {
    chart.destroy();
    chart = null;
  }
  if (!chart) {
    chart = new Chart(ctx, {
      type: isPie ? "doughnut" : "bar",
      data: {
        labels: options,
        datasets: [{
          data: counts,
          backgroundColor: options.map((_, i) => SERIES[i % SERIES.length]),
          borderColor: "#0b0f17",
          borderWidth: isPie ? 3 : 0,
          borderRadius: isPie ? 0 : 8,
          maxBarThickness: 80,
        }],
      },
      options: {
        indexAxis: isPie ? undefined : "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        plugins: {
          legend: {
            display: isPie,
            position: "right",
            labels: {
              color: "#cbd5e1",
              font: { size: 16, weight: "600" },
              padding: 14,
              generateLabels(c) {
                // Custom legend that bakes the vote count + percentage
                // into the label so attendees can read it from far away.
                const data = c.data;
                return data.labels.map((label, i) => {
                  const n = data.datasets[0].data[i];
                  const pct = total ? Math.round(100 * n / total) : 0;
                  return {
                    text: `${label}  —  ${n}  (${pct}%)`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    strokeStyle: data.datasets[0].backgroundColor[i],
                    index: i,
                  };
                });
              },
            },
          },
          tooltip: { enabled: false },
          datalabels: { display: false },
        },
        scales: isPie ? {} : {
          x: {
            beginAtZero: true,
            ticks: { color: "#94a3b8", font: { size: 14 }, precision: 0 },
            grid: { color: "rgba(148, 163, 184, 0.12)" },
          },
          y: {
            ticks: {
              color: "#e2e8f0",
              font: { size: 18, weight: "600" },
              autoSkip: false,
            },
            grid: { display: false },
          },
        },
      },
    });
    chart._type = isPie ? "doughnut" : "bar";
  } else {
    chart.data.labels = options;
    chart.data.datasets[0].data = counts;
    chart.update();
  }
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
      const who = document.createElement("div");
      who.className = "who";
      who.textContent = anonymize(r.email);
      const body = document.createElement("div");
      body.textContent = r.response;
      card.append(who, body);
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

// Keyboard shortcuts: F = toggle fullscreen, R = refresh, Esc = exit.
document.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input, textarea")) return;
  if (e.key === "f" || e.key === "F") {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  } else if (e.key === "r" || e.key === "R") {
    refresh();
  } else if (e.key === "Escape") {
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
});

loadActivity();
