import { api } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "classpp.instructorToken";
let token = localStorage.getItem(TOKEN_KEY) || "";
let activitiesCache = [];
let currentSubmissions = [];
let currentActivityId = null;

function showAuth() {
  $("auth").hidden = false;
  $("dashboard").hidden = true;
}

function showDashboard() {
  $("auth").hidden = true;
  $("dashboard").hidden = false;
  loadActivities();
}

$("auth-form").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("token").value.trim();
  localStorage.setItem(TOKEN_KEY, token);
  showDashboard();
});

$("signout").addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  token = "";
  showAuth();
});

$("refresh").addEventListener("click", loadActivities);

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("prompt").value.trim();
  if (!prompt) return;
  const status = $("new-status");
  status.className = "status";
  status.textContent = "Creating…";
  try {
    const res = await api.createActivity({ prompt, token });
    if (!res.ok) throw new Error(res.error || "Failed");
    status.className = "status success";
    status.textContent = `Created (#${res.activity_id})`;
    $("prompt").value = "";
    loadActivities();
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
  }
});

async function loadActivities() {
  const list = $("activities");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const res = await api.listAllActivities({ token });
    if (!res.ok) throw new Error(res.error || "Failed");
    activitiesCache = res.activities;
    renderActivities();
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

function renderActivities() {
  const list = $("activities");
  list.innerHTML = "";
  if (!activitiesCache.length) {
    list.innerHTML = `<li class="muted">No activities yet.</li>`;
    return;
  }
  activitiesCache.forEach((a) => {
    const li = document.createElement("li");

    const left = document.createElement("div");
    const promptEl = document.createElement("div");
    promptEl.textContent = a.prompt;
    const meta = document.createElement("div");
    meta.className = "meta";
    const tag = `<span class="tag ${a.status}">${a.status}</span>`;
    meta.innerHTML = `#${a.activity_id} · ${tag} · ${a.created_at || ""}`;
    left.append(promptEl, meta);

    const actions = document.createElement("div");
    actions.className = "row";

    const toggle = document.createElement("button");
    toggle.className = "secondary";
    toggle.textContent = a.status === "open" ? "Close" : "Open";
    toggle.addEventListener("click", () => toggleStatus(a));

    const view = document.createElement("button");
    view.textContent = "View responses";
    view.addEventListener("click", () => loadSubmissions(a));

    const linkBtn = document.createElement("button");
    linkBtn.className = "secondary";
    linkBtn.textContent = "Copy link";
    linkBtn.addEventListener("click", () => {
      const url = `${location.origin}/?activity=${encodeURIComponent(a.activity_id)}`;
      navigator.clipboard.writeText(url);
      linkBtn.textContent = "Copied!";
      setTimeout(() => (linkBtn.textContent = "Copy link"), 1500);
    });

    actions.append(toggle, view, linkBtn);
    li.append(left, actions);
    list.appendChild(li);
  });
}

async function toggleStatus(a) {
  const next = a.status === "open" ? "closed" : "open";
  try {
    const res = await api.setStatus({
      activity_id: a.activity_id, status: next, token,
    });
    if (!res.ok) throw new Error(res.error || "Failed");
    loadActivities();
  } catch (err) {
    alert(err.message);
  }
}

async function loadSubmissions(a) {
  currentActivityId = a.activity_id;
  $("submissions-card").hidden = false;
  $("submissions-title").textContent = `Submissions — ${a.prompt}`;
  const tbody = $("submissions-table").querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="3" class="muted">Loading…</td></tr>`;
  try {
    const res = await api.listSubmissions({ activity_id: a.activity_id, token });
    if (!res.ok) throw new Error(res.error || "Failed");
    currentSubmissions = res.submissions;
    tbody.innerHTML = "";
    if (!currentSubmissions.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">No submissions yet.</td></tr>`;
      return;
    }
    currentSubmissions.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(s.timestamp)}</td>
        <td>${escapeHTML(s.student_id)}</td>
        <td>${escapeHTML(s.response)}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

$("export-csv").addEventListener("click", () => {
  if (!currentSubmissions.length) return;
  const rows = [["timestamp", "student_id", "response"]];
  currentSubmissions.forEach((s) =>
    rows.push([s.timestamp, s.student_id, s.response]));
  const csv = rows.map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `submissions-${currentActivityId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

if (token) showDashboard();
else showAuth();
