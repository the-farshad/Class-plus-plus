import { api, session, API_BASE_URL } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.hidden = false; };
const hide = (id) => { const el = $(id); if (el) el.hidden = true; };

let activitiesCache = [];
let currentSubmissions = [];
let currentActivityId = null;
let currentActivityData = null;
let classesCache = [];
let currentClassId = null;
let liveRefreshTimer = null;
let participationChart = null;
let liveChart = null;
let ratingHistChart = null;

function setStatus(targetId, msg, kind = "") {
  const el = $(targetId);
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Sign-in ----------

async function showSignIn() {
  hide("dashboard"); hide("forbidden-card");
  show("signin-card");
  try {
    const cfg = await api.authConfig();
    renderGoogleButton(cfg.google_client_id);
  } catch (err) {
    setStatus("signin-status", `Couldn't reach server: ${err.message}`, "error");
  }
}

function renderGoogleButton(clientId) {
  const tryRender = () => {
    if (!window.google?.accounts?.id) { setTimeout(tryRender, 200); return; }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          await api.signIn(resp.credential);
          enterDashboard();
        } catch (err) {
          setStatus("signin-status", err.message, "error");
        }
      },
    });
    window.google.accounts.id.renderButton($("g_id_signin"), {
      theme: "filled_blue", size: "large", shape: "pill", text: "signin_with",
    });
  };
  tryRender();
}

function enterDashboard() {
  const u = session.user;
  if (!u) return showSignIn();
  if (u.role !== "instructor" && u.role !== "superadmin") {
    hide("signin-card"); hide("dashboard");
    show("forbidden-card");
    return;
  }
  hide("signin-card"); hide("forbidden-card");
  show("dashboard");
  $("who-am-i").textContent = u.email;
  $("signout").hidden = false;

  initTabs();
  loadStats();
  loadClasses();
  loadActivities();
  loadAllowlist();
  if (u.role === "superadmin") {
    show("instructors-card");
    loadInstructors();
  }
}

// ---------- Stats & Overview ----------

/** Build rolling-30-day labels + per-day activity counts from the activities cache. */
function buildParticipationDataset(activities) {
  // Generate last-30-day date labels
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = [];
  const counts = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    labels.push(
      i === 0 ? "Today" :
      i === 1 ? "Yesterday" :
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    const dayCount = activities.filter(a => {
      if (!a.created_at) return false;
      return new Date(a.created_at).toISOString().slice(0, 10) === key;
    }).length;
    counts.push(dayCount);
  }
  return { labels, counts };
}

async function loadStats() {
  try {
    const [statsRes, activitiesRes] = await Promise.all([
      api.getStats(),
      api.listAllActivities(null),
    ]);

    $("stat-students").textContent = statsRes.stats.students;
    $("stat-activities").textContent = statsRes.stats.activities;

    // Update cache so filter dropdown also reflects latest
    activitiesCache = activitiesRes.activities;

    // Build real 30-day dataset
    const { labels, counts } = buildParticipationDataset(activitiesRes.activities);

    // Stat card: total activities created
    const totalCreated = activitiesRes.activities.length;
    const openCount = activitiesRes.activities.filter(a => a.status === "open").length;

    // Add extra stat chips if elements exist
    const statTotalEl = $("stat-total-activities");
    if (statTotalEl) statTotalEl.textContent = totalCreated;
    const statOpenEl = $("stat-open-activities");
    if (statOpenEl) statOpenEl.textContent = openCount;

    if (participationChart) participationChart.destroy();
    const ctx = $("participation-chart").getContext("2d");

    // Use CSS variable colours so chart respects theme
    const style = getComputedStyle(document.documentElement);
    const brand1 = style.getPropertyValue("--brand").trim() || "#2563eb";
    const brand2 = style.getPropertyValue("--brand").trim() || "#2563eb";

    participationChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Activities created",
          data: counts,
          backgroundColor: `color-mix(in srgb, ${brand1} 50%, transparent)`,
          borderColor: brand1,
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 10,
              color: style.getPropertyValue("--muted").trim() || "#6b7280",
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: style.getPropertyValue("--muted").trim() || "#6b7280",
              font: { size: 11 },
            },
            grid: {
              color: style.getPropertyValue("--border").trim() || "#e5e7eb",
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.y} activit${ctx.parsed.y !== 1 ? "ies" : "y"}`,
            },
          },
        },
      },
    });

    $("export-csv-all").disabled = false;
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

$("refresh-stats").addEventListener("click", loadStats);

$("export-csv-all").addEventListener("click", async () => {
  try {
    $("export-csv-all").textContent = "Exporting...";
    const res = await api.exportGlobalRoster();
    if (!res.roster.length) {
      alert("No students in database.");
      $("export-csv-all").textContent = "Global Statistics";
      return;
    }
    const rows = [["Student Email", "Student ID", "Class Code", "Class Name"]];
    res.roster.forEach(r => rows.push([r.student_email, r.student_id || "", r.class_code || "", r.class_name || ""]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `global-roster-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    $("export-csv-all").textContent = "Global Statistics";
  } catch (err) {
    alert("Export failed: " + err.message);
    $("export-csv-all").textContent = "Global Statistics";
  }
});

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll(".sidebar-nav-item").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".sidebar-nav-item").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".dashboard-content > section").forEach(s => s.classList.remove("active"));
      const target = e.currentTarget;
      target.classList.add("active");
      $(target.dataset.tab).classList.add("active");
    });
  });
}

$("signout").addEventListener("click", (e) => { e.preventDefault(); api.signOut(); location.reload(); });
$("forbidden-signout").addEventListener("click", () => { api.signOut(); location.reload(); });

// ---------- Classes ----------

async function loadClasses() {
  try {
    const res = await api.listClasses();
    classesCache = res.classes;
    renderClassSelectors();
    renderClassList();
  } catch (err) {
    console.error("Failed to load classes", err);
  }
}

function renderClassSelectors() {
  ["class-selector", "activity-class-filter", "fs-class-selector"].forEach(selId => {
    const sel = $(selId);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Global / All Classes</option>';
    classesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.code || ""} ${c.name}`.trim();
      sel.appendChild(opt);
    });
    sel.value = val;
  });
}

$("class-selector").addEventListener("change", (e) => {
  currentClassId = e.target.value || null;
  loadActivities();
});

$("activity-class-filter").addEventListener("change", (e) => {
  const filtered = e.target.value
    ? activitiesCache.filter(a => String(a.class_id) === e.target.value)
    : activitiesCache;
  renderActivities(filtered);
});

$("new-class-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("class-name").value.trim();
  const code = $("class-code").value.trim();
  try {
    await api.createClass(name, code);
    $("class-name").value = "";
    $("class-code").value = "";
    loadClasses();
  } catch (err) {
    alert(err.message);
  }
});

function renderClassList() {
  const list = $("class-list");
  list.innerHTML = "";
  if (!classesCache.length) {
    list.innerHTML = '<li class="muted">No classes created yet.</li>';
    return;
  }
  classesCache.forEach(c => {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.innerHTML = `<strong>${escapeHTML(c.code || "")} ${escapeHTML(c.name)}</strong>`;
    const actions = document.createElement("div");
    actions.className = "row";

    const rosterBtn = document.createElement("button");
    rosterBtn.className = "sm";
    rosterBtn.textContent = "Students";
    rosterBtn.addEventListener("click", () => showStudentMgmt(c));

    const editBtn = document.createElement("button");
    editBtn.className = "secondary sm";
    editBtn.innerHTML = `<i data-lucide="edit-2" style="width:14px;height:14px;"></i>`;
    editBtn.title = "Edit Class";
    editBtn.addEventListener("click", () => {
      $("edit-class-id").value = c.id;
      $("edit-class-name").value = c.name;
      $("edit-class-code").value = c.code || "";
      show("modal-edit-class");
      show("modal-overlay");
    });

    const delBtn = document.createElement("button");
    delBtn.className = "secondary sm";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete class and all its data?")) return;
      await api.deleteClass(c.id);
      loadClasses();
    });

    actions.append(rosterBtn, editBtn, delBtn);
    li.append(info, actions);
    list.appendChild(li);
  });
  if (window.lucide) window.lucide.createIcons();
}

$("close-edit-class").addEventListener("click", () => { hide("modal-edit-class"); hide("modal-overlay"); });
$("edit-class-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("edit-class-id").value;
  const name = $("edit-class-name").value.trim();
  const code = $("edit-class-code").value.trim();
  setStatus("edit-class-status", "Saving...");
  try {
    await api.updateClass(id, { name, code });
    setStatus("edit-class-status", "Saved!", "success");
    setTimeout(() => {
      hide("modal-edit-class"); hide("modal-overlay");
      setStatus("edit-class-status", "");
      loadClasses();
    }, 500);
  } catch (err) {
    setStatus("edit-class-status", err.message, "error");
  }
});

// ---------- Students ----------

let activeMgmtClass = null;

function showStudentMgmt(c) {
  activeMgmtClass = c;
  $("student-mgmt-title").textContent = `Students — ${c.code || ""} ${c.name}`;
  show("student-management");
  loadClassStudents();
}

$("close-student-mgmt").addEventListener("click", () => hide("student-management"));

$("add-student-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("student-email").value.trim();
  const student_id = $("student-id-field").value.trim();
  try {
    await api.addClassStudent(activeMgmtClass.id, { email, student_id });
    $("student-email").value = "";
    $("student-id-field").value = "";
    loadClassStudents();
  } catch (err) {
    alert(err.message);
  }
});

async function loadClassStudents() {
  const list = $("student-list");
  list.innerHTML = '<li class="muted">Loading…</li>';
  try {
    const res = await api.listClassStudents(activeMgmtClass.id);
    list.innerHTML = "";
    if (!res.students.length) {
      list.innerHTML = '<li class="muted">No students in this class.</li>';
      return;
    }
    res.students.forEach(s => {
      const li = document.createElement("li");
      li.innerHTML = `<div>${escapeHTML(s.student_email)} <span class="muted">${escapeHTML(s.student_id || "")}</span></div>`;
      const delBtn = document.createElement("button");
      delBtn.className = "secondary sm";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Remove ${s.student_email}?`)) return;
        await api.removeClassStudent(activeMgmtClass.id, s.student_email);
        loadClassStudents();
      });
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Activities ----------

$("activity-type").addEventListener("change", (e) => {
  const t = e.target.value;
  if (t === "poll" || t === "poll_pie") show("poll-options-container");
  else hide("poll-options-container");
});

$("refresh-activities").addEventListener("click", loadActivities);

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("prompt").value.trim();
  const uiType = $("activity-type").value;
  const classId = $("class-selector").value || null;

  // Normalise: poll_pie → type "poll" with a flag
  let type = uiType;
  let options = [];

  if (uiType === "poll" || uiType === "poll_pie") {
    type = "poll";
    options = $("poll-options").value.split(",").map(s => s.trim()).filter(Boolean);
    if (options.length < 2) {
      setStatus("new-status", "Poll needs at least 2 options", "error");
      return;
    }
    // Store chart style in prompt prefix hidden field (or a custom field)
    // For simplicity we encode it in the type field itself for pie
    if (uiType === "poll_pie") type = "poll_pie";
  }

  if (!prompt) return;
  setStatus("new-status", "Creating…");
  try {
    const res = await api.createActivity(prompt, classId, type, options);
    setStatus("new-status", `Created (#${res.activity_id})`, "success");
    $("prompt").value = "";
    $("poll-options").value = "";
    loadActivities();
  } catch (err) {
    setStatus("new-status", err.message, "error");
  }
});

async function loadActivities() {
  const list = $("activities");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const res = await api.listAllActivities(currentClassId);
    activitiesCache = res.activities;
    renderActivities(activitiesCache);
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

const TYPE_LABELS = {
  submission: "📝 Submission",
  poll: "📊 Poll (Bar)",
  poll_pie: "🥧 Poll (Pie)",
  rating: "⭐ Rating",
  word_cloud: "☁️ Word Cloud",
};

function renderActivities(list_data) {
  const list = $("activities");
  list.innerHTML = "";
  if (!list_data.length) {
    list.innerHTML = `<li class="muted">No activities for this class.</li>`;
    return;
  }
  list_data.forEach((a) => {
    const li = document.createElement("li");
    li.dataset.type = a.type; // enables CSS left-border color per type
    const left = document.createElement("div");
    const promptEl = document.createElement("div");
    const label = TYPE_LABELS[a.type] || a.type.toUpperCase();
    promptEl.innerHTML = `<strong>[${label}]</strong> ${escapeHTML(a.prompt)}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const created = a.created_at ? new Date(a.created_at).toLocaleString() : "";
    meta.innerHTML = `#${a.activity_id} · <span class="tag ${a.status}">${a.status}</span> · ${escapeHTML(created)}`;
    left.append(promptEl, meta);

    const actions = document.createElement("div");
    actions.className = "row";

    const toggle = document.createElement("button");
    toggle.className = "secondary sm";
    toggle.textContent = a.status === "open" ? "Close" : "Open";
    toggle.addEventListener("click", () => toggleStatus(a));

    const view = document.createElement("button");
    view.className = "sm";
    view.textContent = a.type === "submission" ? "Responses" : "Results";
    view.addEventListener("click", () => showLiveResults(a));

    const qrBtn = document.createElement("button");
    qrBtn.className = "secondary sm";
    qrBtn.innerHTML = `<i data-lucide="qr-code" style="width:14px;height:14px;"></i>`;
    qrBtn.title = "Show QR Code";
    qrBtn.addEventListener("click", () => showQR(a));

    const linkBtn = document.createElement("button");
    linkBtn.className = "secondary sm";
    linkBtn.textContent = "Copy link";
    linkBtn.addEventListener("click", () => {
      const url = activityURL(a);
      navigator.clipboard.writeText(url);
      linkBtn.textContent = "Copied!";
      setTimeout(() => (linkBtn.textContent = "Copy link"), 1500);
    });

    actions.append(toggle, view, qrBtn, linkBtn);
    li.append(left, actions);
    list.appendChild(li);
  });
  if (window.lucide) window.lucide.createIcons();
}

function activityURL(a) {
  return `${location.origin}/?activity=${encodeURIComponent(a.activity_id)}`;
}

async function toggleStatus(a) {
  const next = a.status === "open" ? "closed" : "open";
  try {
    await api.setActivityStatus(a.activity_id, next);
    loadActivities();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Live Results (unified for all types) ----------

function stopLiveRefresh() {
  if (liveRefreshTimer) { clearInterval(liveRefreshTimer); liveRefreshTimer = null; }
}

async function showLiveResults(a) {
  stopLiveRefresh();
  currentActivityData = a;
  currentActivityId = a.activity_id;

  hide("activities-list-container");
  show("live-results-card");

  $("live-results-title").textContent = a.prompt;
  $("live-results-count").textContent = "";

  const liveBadge = $("live-badge");
  liveBadge.style.display = a.status === "open" ? "" : "none";

  // Clear previous content
  $("live-chart-container").innerHTML = "";
  hide("word-cloud-container");
  hide("rating-stats");
  hide("submissions-table-wrapper");

  await refreshLiveResults();

  if (a.status === "open") {
    liveRefreshTimer = setInterval(refreshLiveResults, 4000);
  }
}

async function refreshLiveResults() {
  const a = currentActivityData;
  if (!a) return;

  try {
    if (a.type === "poll" || a.type === "poll_pie") {
      await renderPollChart(a);
    } else if (a.type === "rating") {
      await renderRatingResults(a);
    } else if (a.type === "word_cloud") {
      await renderWordCloud(a);
    } else {
      await renderSubmissionTable(a);
    }
  } catch (err) {
    console.error("refreshLiveResults", err);
  }
}

async function renderPollChart(a) {
  const res = await api.getResults(a.activity_id);
  const options = res.options || [];
  const totalVotes = res.votes.reduce((acc, v) => acc + v.count, 0);
  const counts = options.map((_, idx) => res.votes.find(v => v.option_index === idx)?.count || 0);

  $("live-results-count").textContent = `${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`;

  const container = $("live-chart-container");
  let canvas = container.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.style.maxHeight = "380px";
    container.appendChild(canvas);
  }

  const palette = [
    "rgba(99,102,241,0.8)", "rgba(236,72,153,0.8)", "rgba(34,197,94,0.8)",
    "rgba(251,191,36,0.8)", "rgba(59,130,246,0.8)", "rgba(239,68,68,0.8)",
    "rgba(16,185,129,0.8)", "rgba(245,158,11,0.8)",
  ];

  const isPie = a.type === "poll_pie";

  if (liveChart) liveChart.destroy();
  liveChart = new Chart(canvas.getContext("2d"), {
    type: isPie ? "doughnut" : "bar",
    data: {
      labels: options,
      datasets: [{
        label: "Votes",
        data: counts,
        backgroundColor: palette.slice(0, options.length),
        borderRadius: isPie ? 0 : 6,
        borderWidth: isPie ? 2 : 0,
        borderColor: "#fff",
      }],
    },
    options: {
      indexAxis: isPie ? undefined : "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: isPie },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = totalVotes ? Math.round((ctx.parsed / totalVotes) * 100) : 0;
              return ` ${ctx.parsed} votes (${pct}%)`;
            },
          },
        },
      },
      scales: isPie ? {} : {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

async function renderRatingResults(a) {
  const res = await api.listSubmissions(a.activity_id);
  currentSubmissions = res.submissions;
  const nums = currentSubmissions.map(s => parseFloat(s.response)).filter(n => !isNaN(n));
  const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : "—";

  show("rating-stats");
  $("rating-avg").textContent = avg;
  $("rating-count").textContent = nums.length;
  $("live-results-count").textContent = `${nums.length} response${nums.length !== 1 ? "s" : ""}`;

  const buckets = Array(10).fill(0);
  nums.forEach(n => { const i = Math.min(9, Math.max(0, Math.round(n) - 1)); buckets[i]++; });

  const canvas = $("rating-histogram");
  if (ratingHistChart) ratingHistChart.destroy();
  ratingHistChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["1","2","3","4","5","6","7","8","9","10"],
      datasets: [{
        label: "Responses",
        data: buckets,
        backgroundColor: "rgba(99,102,241,0.7)",
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

async function renderWordCloud(a) {
  const res = await api.listSubmissions(a.activity_id);
  currentSubmissions = res.submissions;
  $("live-results-count").textContent = `${res.submissions.length} response${res.submissions.length !== 1 ? "s" : ""}`;

  // Build word frequency map
  const freq = {};
  res.submissions.forEach(s => {
    (s.response || "").toLowerCase().split(/[\s,;.!?]+/).forEach(w => {
      w = w.replace(/[^a-z0-9']+/g, "");
      if (w.length > 2) freq[w] = (freq[w] || 0) + 1;
    });
  });

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 60);
  const maxCount = sorted[0]?.[1] || 1;

  const container = $("word-cloud-container");
  container.innerHTML = "";
  sorted.forEach(([word, count]) => {
    const span = document.createElement("span");
    const size = 0.8 + (count / maxCount) * 2.4;
    const opacity = 0.5 + (count / maxCount) * 0.5;
    span.className = "wc-word";
    span.textContent = word;
    span.style.fontSize = `${size}rem`;
    span.style.opacity = opacity;
    span.title = `${count} time${count !== 1 ? "s" : ""}`;
    container.appendChild(span);
  });

  if (!sorted.length) container.innerHTML = '<p class="muted">No responses yet.</p>';
  show("word-cloud-container");
}

async function renderSubmissionTable(a) {
  const res = await api.listSubmissions(a.activity_id);
  currentSubmissions = res.submissions;
  $("live-results-count").textContent = `${res.submissions.length} response${res.submissions.length !== 1 ? "s" : ""}`;

  const tbody = $("submissions-table").querySelector("tbody");
  tbody.innerHTML = "";
  if (!res.submissions.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No submissions yet.</td></tr>`;
  } else {
    res.submissions.forEach((s) => {
      const tr = document.createElement("tr");
      const when = new Date(s.created_at).toLocaleString();
      tr.innerHTML = `
        <td>${escapeHTML(when)}</td>
        <td>${escapeHTML(s.email)}${s.student_id ? `<br><span class="muted">${escapeHTML(s.student_id)}</span>` : ""}</td>
        <td>${escapeHTML(s.response)}</td>
        <td>${attachmentCell(s)}</td>`;
      tbody.appendChild(tr);
    });
  }
  show("submissions-table-wrapper");
}

function attachmentCell(s) {
  if (s.drive_url) return `<a href="${escapeHTML(s.drive_url)}" target="_blank" rel="noopener">View on Drive ↗</a>`;
  if (s.attachment_local) {
    const url = `${API_BASE_URL}/uploads/${encodeURIComponent(s.attachment_local)}`;
    if ((s.attachment_mime || "").startsWith("image/")) {
      return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener"><img src="${escapeHTML(url)}" alt="" style="max-height:64px; border-radius:6px;"></a>`;
    }
    return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">Download</a>`;
  }
  return `<span class="muted">—</span>`;
}

$("close-live-results").addEventListener("click", () => {
  stopLiveRefresh();
  if (liveChart) { liveChart.destroy(); liveChart = null; }
  if (ratingHistChart) { ratingHistChart.destroy(); ratingHistChart = null; }
  hide("live-results-card");
  show("activities-list-container");
});

$("btn-project").addEventListener("click", () => {
  if (!currentActivityData) return;
  const url = activityURL(currentActivityData);
  window.open(url, "_blank");
});

$("export-csv").addEventListener("click", () => {
  if (!currentSubmissions.length) return;
  const rows = [["timestamp", "email", "student_id", "response", "attachment"]];
  currentSubmissions.forEach((s) => {
    const attachment = s.drive_url || (s.attachment_local ? `${API_BASE_URL}/uploads/${s.attachment_local}` : "");
    rows.push([new Date(s.created_at).toISOString(), s.email, s.student_id || "", s.response, attachment]);
  });
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `responses-${currentActivityId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- QR Code ----------

let _qrInstance = null;

function showQR(a) {
  const url = activityURL(a);
  $("qr-url").textContent = url;
  const container = $("qr-code");
  container.innerHTML = "";
  if (window.QRCode) {
    _qrInstance = new window.QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } else {
    container.innerHTML = `<p class="muted">QRCode library not loaded.</p>`;
  }
  show("modal-qr");
  show("modal-overlay");
}

$("close-qr").addEventListener("click", () => { hide("modal-qr"); hide("modal-overlay"); });
$("copy-qr-link").addEventListener("click", () => {
  navigator.clipboard.writeText($("qr-url").textContent);
  $("copy-qr-link").textContent = "Copied!";
  setTimeout(() => { $("copy-qr-link").textContent = "Copy link"; }, 1500);
});

// ---------- First Session Pack ----------

const FIRST_SESSION_QUESTIONS = [
  {
    prompt: "What year are you in?",
    type: "poll",
    options: ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"],
  },
  {
    prompt: "Which department are you in?",
    type: "poll",
    options: ["CS", "CE", "EE", "Math", "Physics", "Other"],
  },
  {
    prompt: "Rate your overall programming experience (1 = complete beginner, 10 = very experienced)",
    type: "rating",
    options: [],
  },
  {
    prompt: "Which programming languages have you used before? (pick closest)",
    type: "poll",
    options: ["Python", "C / C++", "Java", "JavaScript", "None yet"],
  },
  {
    prompt: "What do you hope to learn this semester? (1–3 words)",
    type: "word_cloud",
    options: [],
  },
  {
    prompt: "How do you prefer to study?",
    type: "poll",
    options: ["Alone", "Study group", "Tutoring", "Videos / tutorials", "Trial and error"],
  },
  {
    prompt: "🧊 Icebreaker: If you could master one technology instantly, what would it be?",
    type: "submission",
    options: [],
  },
  {
    prompt: "🧊 Icebreaker: Share one fun or surprising fact about yourself.",
    type: "submission",
    options: [],
  },
];

$("btn-launch-first-session").addEventListener("click", async () => {
  const btn = $("btn-launch-first-session");
  const classId = $("fs-class-selector").value || null;
  setStatus("fs-status", "Launching all 8 questions…");
  btn.disabled = true;

  try {
    const created = [];
    for (const q of FIRST_SESSION_QUESTIONS) {
      const res = await api.createActivity(q.prompt, classId, q.type, q.options);
      created.push(res.activity_id);
    }
    setStatus("fs-status", `Launched ${created.length} activities! Switching to Activities tab…`, "success");

    // Switch to activities tab after a moment
    setTimeout(() => {
      document.querySelector('[data-tab="tab-activities"]').click();
      loadActivities();
    }, 1200);
  } catch (err) {
    setStatus("fs-status", err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------- Allowlist ----------

$("allow-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("allow-email").value.trim();
  const note = $("allow-note").value.trim();
  setStatus("allow-status", "Adding…");
  try {
    await api.addAllowlist(email, note);
    setStatus("allow-status", `Added ${email}`, "success");
    $("allow-email").value = "";
    $("allow-note").value = "";
    loadAllowlist();
  } catch (err) {
    setStatus("allow-status", err.message, "error");
  }
});

async function loadAllowlist() {
  const list = $("allow-list");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const res = await api.listAllowlist();
    list.innerHTML = "";
    if (!res.allowlist.length) { list.innerHTML = `<li class="muted">Empty.</li>`; return; }
    res.allowlist.forEach((row) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const email = document.createElement("div");
      email.textContent = row.email;
      const meta = document.createElement("div");
      meta.className = "meta";
      const when = row.added_at ? new Date(row.added_at).toLocaleDateString() : "";
      meta.textContent = [row.note, when].filter(Boolean).join(" · ");
      left.append(email, meta);
      const remove = document.createElement("button");
      remove.className = "secondary sm";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        if (!confirm(`Remove ${row.email}?`)) return;
        try { await api.removeAllowlist(row.email); loadAllowlist(); }
        catch (err) { alert(err.message); }
      });
      li.append(left, remove);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Instructors ----------

$("inst-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("inst-email").value.trim();
  const role = $("inst-role").value;
  setStatus("inst-status", "Adding…");
  try {
    await api.addInstructor(email, role);
    setStatus("inst-status", `Added ${email}`, "success");
    $("inst-email").value = "";
    loadInstructors();
  } catch (err) {
    setStatus("inst-status", err.message, "error");
  }
});

async function loadInstructors() {
  const list = $("inst-list");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const res = await api.listInstructors();
    list.innerHTML = "";
    if (!res.instructors.length) { list.innerHTML = `<li class="muted">Empty.</li>`; return; }
    res.instructors.forEach((row) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const email = document.createElement("div");
      email.textContent = row.email;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = row.role;
      left.append(email, meta);
      const remove = document.createElement("button");
      remove.className = "secondary sm";
      remove.textContent = "Remove";
      if (row.email === session.user?.email) {
        remove.disabled = true;
        remove.title = "Cannot remove yourself";
      }
      remove.addEventListener("click", async () => {
        if (!confirm(`Remove ${row.email}?`)) return;
        try { await api.removeInstructor(row.email); loadInstructors(); }
        catch (err) { alert(err.message); }
      });
      li.append(left, remove);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Edit Activity Modal ----------

$("close-edit-activity").addEventListener("click", () => { hide("modal-edit-activity"); hide("modal-overlay"); });
$("edit-activity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("edit-activity-id").value;
  const prompt = $("edit-activity-prompt").value.trim();
  const difficulty = $("edit-activity-difficulty").value;
  setStatus("edit-activity-status", "Saving...");
  try {
    await api.updateActivity(id, { prompt, difficulty });
    setStatus("edit-activity-status", "Saved!", "success");
    setTimeout(() => {
      hide("modal-edit-activity"); hide("modal-overlay");
      setStatus("edit-activity-status", "");
      loadActivities();
    }, 500);
  } catch (err) {
    setStatus("edit-activity-status", err.message, "error");
  }
});

function closeAllModals() {
  hide("modal-edit-class"); hide("modal-edit-activity"); hide("modal-qr");
  hide("modal-overlay");
}

$("modal-overlay").addEventListener("click", closeAllModals);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllModals();
});

// ---------- Boot ----------

if (session.token) enterDashboard();
else showSignIn();
