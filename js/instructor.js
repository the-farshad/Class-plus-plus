import { api, session, API_BASE_URL } from "/js/api.js";
import {
  $, show, hide, escapeHTML, setStatus,
  mountSettingsDrawer, updateUserPill, setupMicrosoftSignIn,
} from "/js/ui.js";

api.initTheme();

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

// ---------- Sign-in ----------

async function showSignIn() {
  hide("dashboard"); hide("forbidden-card");
  const navSignin = $("nav-signin");
  if (navSignin) navSignin.hidden = true;
  show("signin-card");

  const form = $("password-form");
  if (form && !form.dataset.wired) {
    form.dataset.wired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("pw-email").value.trim().toLowerCase();
      const password = $("pw-password").value;
      const btn = $("pw-submit");
      btn.disabled = true;
      setStatus("signin-status", "Signing in…");
      try {
        await api.signInWithPassword(email, password);
        $("pw-password").value = "";
        enterDashboard();
      } catch (err) {
        setStatus("signin-status", err.message || "Sign-in failed", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Google sign-in stays available as a secondary option for instructors.
  try {
    const cfg = await api.authConfig();
    if (cfg.google_client_id) renderGoogleButton(cfg.google_client_id);
  } catch { /* server unreachable — password form may still work via cached session */ }
}

// Pick a Google button theme that visually matches the active site theme.
function pickGoogleTheme() {
  const t = document.documentElement.getAttribute("data-theme") || "light";
  if (t === "dark" || t === "high-contrast") return "filled_black";
  return "filled_blue";
}

function renderGoogleButton(clientId) {
  const target = $("g_id_signin");
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

    const draw = () => {
      if (!target) return;
      target.innerHTML = "";
      window.google.accounts.id.renderButton(target, {
        theme: pickGoogleTheme(),
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: 280,
      });
    };
    draw();

    // Re-render when the user switches themes from the settings drawer.
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
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
  updateUserPill(u);
  $("who-am-i").textContent = u.email;
  show("signout");

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

function markStatUnavailable(id, err) {
  const el = $(id);
  if (!el) return;
  el.textContent = "—";
  el.classList.add("stat-unavailable");
  const card = el.closest(".stat-card");
  if (card) card.title = `Could not load: ${err?.message || err}`;
}

async function loadStats() {
  // Load basic counters — must not fail silently
  try {
    const statsRes = await api.getStats();
    $("stat-students").textContent = statsRes.stats.students;
    $("stat-activities").textContent = statsRes.stats.activities;
    $("stat-students").classList.remove("stat-unavailable");
    $("stat-activities").classList.remove("stat-unavailable");
  } catch (err) {
    markStatUnavailable("stat-students", err);
    markStatUnavailable("stat-activities", err);
    console.error("getStats failed", err);
  }

  // Load activity list for chart + totals (independent of counters above)
  try {
    const activitiesRes = await api.listAllActivities(null);
    activitiesCache = activitiesRes.activities;

    const totalCreated = activitiesRes.activities.length;
    const statTotalEl = $("stat-total-activities");
    if (statTotalEl) {
      statTotalEl.textContent = totalCreated;
      statTotalEl.classList.remove("stat-unavailable");
    }

    $("export-csv-all").disabled = false;

    const { labels, counts } = buildParticipationDataset(activitiesRes.activities);
    if (participationChart) participationChart.destroy();

    const chartEl = $("participation-chart");
    if (!chartEl) return;
    const ctx = chartEl.getContext("2d");
    const style = getComputedStyle(document.documentElement);
    const brand = style.getPropertyValue("--brand").trim() || "#2563eb";

    participationChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Activities created",
          data: counts,
          backgroundColor: `color-mix(in srgb, ${brand} 50%, transparent)`,
          borderColor: brand,
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
            ticks: { maxTicksLimit: 10, color: style.getPropertyValue("--muted").trim() || "#6b7280", font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: style.getPropertyValue("--muted").trim() || "#6b7280", font: { size: 11 } },
            grid: { color: style.getPropertyValue("--border").trim() || "#e5e7eb" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${c.parsed.y} activit${c.parsed.y !== 1 ? "ies" : "y"}` } },
        },
      },
    });
  } catch (err) {
    markStatUnavailable("stat-total-activities", err);
    console.error("listAllActivities failed", err);
  }
}

$("refresh-stats").addEventListener("click", loadStats);

$("export-csv-all").addEventListener("click", async () => {
  const btn = $("export-csv-all");
  btn.textContent = "Exporting…";
  btn.disabled = true;
  try {
    const res = await api.exportGlobalRoster();
    if (!res.roster.length) { alert("No students in database."); return; }
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
  } catch (err) {
    alert("Export failed: " + err.message);
  } finally {
    btn.textContent = "Download CSV";
    btn.disabled = false;
  }
});

// ---------- Tabs ----------

function initTabs() {
  const tabs = [...document.querySelectorAll(".sidebar-nav-item")];

  function activate(btn) {
    tabs.forEach(b => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
      b.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    document.querySelectorAll(".dashboard-content > section").forEach(s => s.classList.remove("active"));
    $(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "tab-overview") loadStats();
  }

  tabs.forEach((btn, i) => {
    btn.setAttribute("tabindex", btn.classList.contains("active") ? "0" : "-1");
    btn.addEventListener("click", () => activate(btn));
    btn.addEventListener("keydown", (e) => {
      // Arrow keys move between tabs per ARIA tablist authoring practice
      let target = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") target = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") target = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") target = tabs[0];
      else if (e.key === "End") target = tabs[tabs.length - 1];
      if (target) {
        e.preventDefault();
        activate(target);
        target.focus();
      }
    });
  });
}

// ---------- Settings modal ----------

mountSettingsDrawer({
  api,
  session,
  onSignOut: () => { api.signOut(); location.reload(); },
});

$("forbidden-signout").addEventListener("click", () => { api.signOut(); location.reload(); });

// ---------- Classes ----------

async function loadClasses() {
  try {
    const res = await api.listClasses();
    classesCache = res.classes;
    const statClasses = $("stat-classes");
    if (statClasses) {
      statClasses.textContent = classesCache.length;
      statClasses.classList.remove("stat-unavailable");
    }
    renderClassSelectors();
    renderClassList();
  } catch (err) {
    markStatUnavailable("stat-classes", err);
    console.error("Failed to load classes", err);
  }
}

function renderClassSelectors() {
  ["class-selector", "activity-class-filter"].forEach(selId => {
    const sel = $(selId);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Global</option>';
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

function applyActivityFilters() {
  const cls = $("activity-class-filter")?.value || "";
  const ses = $("activity-session-filter")?.value || "";
  let out = activitiesCache;
  if (cls) out = out.filter(a => String(a.class_id) === cls);
  if (ses) out = out.filter(a => a.session_tag === ses);
  renderActivities(out);
}

$("activity-class-filter").addEventListener("change", applyActivityFilters);
$("activity-session-filter")?.addEventListener("change", applyActivityFilters);

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
    rosterBtn.className = "secondary sm";
    rosterBtn.innerHTML = `<i data-lucide="users" style="width:13px;height:13px;"></i> Roster`;
    rosterBtn.addEventListener("click", () => showStudentMgmt(c));

    const editBtn = document.createElement("button");
    editBtn.className = "secondary sm";
    editBtn.innerHTML = `<i data-lucide="edit-2" style="width:13px;height:13px;"></i>`;
    editBtn.title = "Edit class";
    editBtn.setAttribute("aria-label", `Edit class ${c.name}`);
    editBtn.addEventListener("click", () => {
      $("edit-class-id").value = c.id;
      $("edit-class-name").value = c.name;
      $("edit-class-code").value = c.code || "";
      show("modal-edit-class");
      show("modal-overlay");
    });

    const delBtn = document.createElement("button");
    delBtn.className = "secondary sm danger";
    delBtn.innerHTML = `<i data-lucide="trash-2" style="width:13px;height:13px;"></i>`;
    delBtn.title = "Delete class";
    delBtn.setAttribute("aria-label", `Delete class ${c.name}`);
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

// Bulk password generation for everyone in the active class.
$("btn-bulk-passwords").addEventListener("click", async () => {
  if (!activeMgmtClass) return;
  const rotate = confirm(
    "Generate passwords for every student in this class.\n\n" +
    "OK = only for students without a password yet (recommended)\n" +
    "Cancel = abort\n\n" +
    "(To force-rotate everyone's password, hold Shift while clicking instead.)"
  );
  if (!rotate) return;
  const force = window.event && window.event.shiftKey;
  const btn = $("btn-bulk-passwords");
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const res = await api.bulkGeneratePasswords(activeMgmtClass.id, force);
    showBulkPasswordsResult(res.generated, res.skipped, activeMgmtClass);
  } catch (err) {
    alert("Bulk password generation failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="key-round" style="width:13px;height:13px;"></i> Passwords for all`;
    if (window.lucide) window.lucide.createIcons();
  }
});

function showBulkPasswordsResult(generated, skipped, cls) {
  let modal = document.getElementById("modal-bulk-pw");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-bulk-pw";
    modal.className = "modal-center";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.style.maxWidth = "640px";
    document.body.appendChild(modal);
  }
  const rows = generated.map(g =>
    `<tr><td>${escapeHTML(g.email)}</td><td>${escapeHTML(g.name)}</td><td style="font-family:var(--font-mono);font-weight:600;">${escapeHTML(g.password)}</td></tr>`
  ).join("");
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;">
      <h2 style="margin:0;">Passwords for ${escapeHTML(cls.name)}</h2>
      <button id="close-bulkpw" class="icon-btn" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    </div>
    <p class="muted" style="font-size:0.85rem;margin:0 0 0.85rem;">
      Generated <strong>${generated.length}</strong> password${generated.length === 1 ? "" : "s"}.
      ${skipped ? `Skipped <strong>${skipped}</strong> (already had one).` : ""}
      Shown ONCE — download or copy now.
    </p>
    <div style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:0.85rem;">
      ${generated.length ? `<table style="margin:0;font-size:0.82rem;">
        <thead><tr><th>Email</th><th>Name</th><th>Password</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `<p class="muted" style="padding:1rem;">No new passwords generated.</p>`}
    </div>
    <div style="display:flex;gap:0.4rem;justify-content:flex-end;">
      <button id="bulkpw-copy" class="secondary sm"><i data-lucide="copy" style="width:13px;height:13px;"></i> Copy as CSV</button>
      <button id="bulkpw-download" class="secondary sm"><i data-lucide="download" style="width:13px;height:13px;"></i> Download CSV</button>
    </div>`;
  show("modal-overlay");
  modal.hidden = false;
  if (window.lucide) window.lucide.createIcons();

  const close = () => { hide("modal-overlay"); modal.hidden = true; };
  document.getElementById("close-bulkpw").addEventListener("click", close);

  const csvFor = () => "email,name,password\n" + generated.map(g =>
    [g.email, g.name, g.password].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  document.getElementById("bulkpw-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(csvFor()); } catch {}
  });
  document.getElementById("bulkpw-download").addEventListener("click", () => {
    const blob = new Blob([csvFor()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(cls.code || cls.name || "class").replace(/\s+/g, "_")}-passwords-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

$("btn-csv-upload").addEventListener("click", async () => {
  const file = $("csv-upload").files[0];
  if (!file) { setStatus("csv-status", "Choose a CSV file first.", "error"); return; }
  if (!activeMgmtClass) { setStatus("csv-status", "Open a class roster first.", "error"); return; }
  setStatus("csv-status", "Parsing…");
  try {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    // Skip header row if it starts with "email" (case-insensitive)
    const dataLines = lines[0]?.toLowerCase().startsWith("email") ? lines.slice(1) : lines;
    const students = dataLines.map(line => {
      const parts = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
      return { email: parts[0] || "", student_id: parts[1] || "" };
    }).filter(s => s.email && s.email.includes("@"));
    if (!students.length) { setStatus("csv-status", "No valid email rows found.", "error"); return; }
    setStatus("csv-status", `Uploading ${students.length} students…`);
    const res = await api.bulkAddClassStudents(activeMgmtClass.id, students);
    setStatus("csv-status", `Added ${res.added} students`, "success");
    $("csv-upload").value = "";
    loadClassStudents();
  } catch (err) {
    setStatus("csv-status", err.message, "error");
  }
});

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

function showGeneratedPassword(email, password) {
  let modal = document.getElementById("modal-generated-pw");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modal-generated-pw";
    modal.className = "modal-center";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <h2 style="margin:0;">Temporary password</h2>
      <button id="close-genpw" class="icon-btn" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    </div>
    <p class="muted" style="font-size:0.85rem;margin:0 0 0.85rem;">
      Share this with <strong>${escapeHTML(email)}</strong>. Shown <strong>once</strong>; copy it now.
    </p>
    <div style="display:flex;gap:0.4rem;align-items:stretch;margin-bottom:0.85rem;">
      <input type="text" id="genpw-value" readonly value="${escapeHTML(password)}" style="font-family:var(--font-mono);font-size:1rem;letter-spacing:0.04em;font-weight:600;" />
      <button id="genpw-copy" class="secondary"><i data-lucide="copy" style="width:14px;height:14px;"></i> Copy</button>
    </div>
    <p class="muted" style="font-size:0.78rem;margin:0;">If you lose it, just click Password again — it rotates.</p>`;
  show("modal-overlay");
  modal.hidden = false;
  if (window.lucide) window.lucide.createIcons();

  const close = () => { hide("modal-overlay"); modal.hidden = true; };
  document.getElementById("close-genpw").addEventListener("click", close);

  const copyBtn = document.getElementById("genpw-copy");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(password);
      copyBtn.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;"></i> Copied`;
      if (window.lucide) window.lucide.createIcons();
    } catch { /* clipboard blocked, ignore */ }
  });

  const valEl = document.getElementById("genpw-value");
  valEl.focus();
  valEl.select();
}

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

      const actions = document.createElement("div");
      actions.className = "row";
      actions.style.gap = "0.3rem";

      const pwBtn = document.createElement("button");
      pwBtn.className = "secondary sm";
      pwBtn.innerHTML = `<i data-lucide="key-round" style="width:13px;height:13px;"></i> Password`;
      pwBtn.title = `Generate / rotate password for ${s.student_email}`;
      pwBtn.setAttribute("aria-label", `Generate password for ${s.student_email}`);
      pwBtn.addEventListener("click", async () => {
        pwBtn.disabled = true;
        try {
          const res = await api.generateStudentPassword(activeMgmtClass.id, s.student_email);
          showGeneratedPassword(s.student_email, res.password);
        } catch (err) {
          alert("Could not generate password: " + err.message);
        } finally {
          pwBtn.disabled = false;
        }
      });

      const delBtn = document.createElement("button");
      delBtn.className = "secondary sm danger";
      delBtn.innerHTML = `<i data-lucide="user-minus" style="width:13px;height:13px;"></i>`;
      delBtn.title = `Remove ${s.student_email}`;
      delBtn.setAttribute("aria-label", `Remove student ${s.student_email}`);
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Remove ${s.student_email}?`)) return;
        await api.removeClassStudent(activeMgmtClass.id, s.student_email);
        loadClassStudents();
      });

      actions.append(pwBtn, delBtn);
      li.appendChild(actions);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Activities ----------

// ---------- Type picker ----------

document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $("activity-type").value = btn.dataset.type;
    const isPoll = btn.dataset.type === "poll" || btn.dataset.type === "poll_pie";
    if (isPoll) {
      show("poll-options-container");
      if (!$("poll-options-list").children.length) {
        addOptionRow("poll-options-list");
        addOptionRow("poll-options-list");
      }
    } else {
      hide("poll-options-container");
    }
  });
});

// ---------- Poll options builder ----------

const LETTERS = "ABCDEFGHIJ";

function addOptionRow(containerId, value = "") {
  const container = $(containerId);
  const idx = container.children.length;
  if (idx >= 8) return;
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `
    <span class="option-letter" aria-hidden="true">${LETTERS[idx] || idx + 1}</span>
    <input type="text" placeholder="Option ${LETTERS[idx] || idx + 1}" aria-label="Option ${LETTERS[idx] || idx + 1}" value="${escapeHTML(value)}" required />
    <button type="button" class="icon-btn remove-option-btn" title="Remove" aria-label="Remove this option" tabindex="-1">
      <i data-lucide="x" style="width:13px;height:13px;"></i>
    </button>`;
  row.querySelector(".remove-option-btn").addEventListener("click", () => {
    row.remove();
    reindexOptions(containerId);
    if (window.lucide) window.lucide.createIcons();
  });
  container.appendChild(row);
  if (window.lucide) window.lucide.createIcons();
}

function reindexOptions(containerId) {
  const rows = $(containerId).querySelectorAll(".option-row");
  rows.forEach((row, i) => {
    const letter = row.querySelector(".option-letter");
    const input = row.querySelector("input");
    if (letter) letter.textContent = LETTERS[i] || i + 1;
    if (input) input.placeholder = `Option ${LETTERS[i] || i + 1}`;
  });
}

function getOptionValues(containerId) {
  return [...$(containerId).querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean);
}

$("add-option-btn").addEventListener("click", () => addOptionRow("poll-options-list"));

$("refresh-activities").addEventListener("click", loadActivities);

// Initialize Flatpickr on every .datetime-input once the library loads.
// Stores the picked timestamp on input.dataset.epochMs so we read it
// directly without re-parsing the visible string.
(function initFlatpickr() {
  const apply = () => {
    if (!window.flatpickr) { setTimeout(apply, 150); return; }
    document.querySelectorAll(".datetime-input").forEach(el => {
      if (el.dataset.fpReady) return;
      el.dataset.fpReady = "1";
      window.flatpickr(el, {
        enableTime: true,
        time_24hr: true,
        minuteIncrement: 5,
        dateFormat: "Y-m-d H:i",
        altInput: false,
        defaultDate: null,
        onChange: (selected) => {
          el.dataset.epochMs = selected && selected[0] ? selected[0].getTime() : "";
        },
      });
    });
  };
  apply();
})();

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("prompt").value.trim();
  const uiType = $("activity-type").value;
  const classId = $("class-selector").value || null;
  const sessionTag = $("session-tag")?.value || null;
  // Flatpickr stored the chosen Date on .dataset.epochMs. Fall back to
  // parsing .value for safety (e.g. if user types manually).
  const readMs = (id) => {
    const el = $(id);
    if (!el) return null;
    if (el.dataset.epochMs) return parseInt(el.dataset.epochMs, 10) || null;
    const t = new Date(el.value).getTime();
    return Number.isNaN(t) ? null : t;
  };
  const releaseAt = readMs("release-at");
  const dueAt     = readMs("due-at");

  let type = uiType;
  let options = [];

  if (uiType === "poll" || uiType === "poll_pie") {
    options = getOptionValues("poll-options-list");
    if (options.length < 2) {
      setStatus("new-status", "Add at least 2 options", "error");
      return;
    }
  }

  if (!prompt) return;
  const btn = e.submitter || e.target.querySelector("button[type=submit]");
  if (btn) btn.disabled = true;
  setStatus("new-status", "Creating…");
  try {
    const res = await api.createActivity(prompt, classId, type, options, sessionTag, releaseAt, dueAt);
    setStatus("new-status", `Launched! (#${res.activity_id})`, "success");
    $("prompt").value = "";
    // Reset Flatpickr fields too — clear the visible value and our stored ms.
    ["release-at", "due-at"].forEach(id => {
      const el = $(id);
      if (!el) return;
      if (el._flatpickr) el._flatpickr.clear();
      else el.value = "";
      delete el.dataset.epochMs;
    });
    // Reset options list
    $("poll-options-list").innerHTML = "";
    loadActivities();
    setTimeout(() => setStatus("new-status", ""), 3000);
  } catch (err) {
    setStatus("new-status", err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
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
  submission: "Submission",
  poll: "Poll",
  poll_pie: "Pie Poll",
  rating: "Rating",
  word_cloud: "Word Cloud",
};
const TYPE_ICONS = {
  submission: "file-text",
  poll: "bar-chart-2",
  poll_pie: "pie-chart",
  rating: "sliders",
  word_cloud: "cloud",
};

// Compact human duration ("3h", "2d", "12m") for the schedule chip.
function shortDelta(ms) {
  const abs = Math.abs(ms);
  const m = Math.round(abs / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

// Render a small "Releases in 3h" / "Due in 2d" / "Past due" chip next to
// the timestamp, so the instructor sees gating at a glance.
function formatScheduleInfo(a) {
  const now = Date.now();
  const parts = [];
  if (a.release_at && a.release_at > now) {
    parts.push(`<span style="color:var(--warning);margin-left:0.4rem;font-size:0.78rem;">Releases in ${shortDelta(a.release_at - now)}</span>`);
  }
  if (a.due_at) {
    if (a.due_at <= now) {
      parts.push(`<span style="color:var(--error);margin-left:0.4rem;font-size:0.78rem;">Past due</span>`);
    } else {
      parts.push(`<span style="color:var(--muted);margin-left:0.4rem;font-size:0.78rem;">Due in ${shortDelta(a.due_at - now)}</span>`);
    }
  }
  return parts.join("");
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function renderActivities(list_data) {
  const list = $("activities");
  list.innerHTML = "";
  if (!list_data.length) {
    list.innerHTML = `<li class="muted" style="padding:1rem;">No activities yet — launch one above.</li>`;
    return;
  }
  list_data.forEach((a) => {
    const li = document.createElement("li");
    li.dataset.type = a.type;
    const left = document.createElement("div");
    const icon = TYPE_ICONS[a.type] || "file-text";
    const label = TYPE_LABELS[a.type] || a.type;
    const isOpen = a.status === "open";
    const sessionBadge = a.session_tag
      ? `<span class="type-badge" style="background:var(--surface-2);color:var(--text);"><i data-lucide="${a.session_tag.startsWith("prog") ? "code-2" : "flask-conical"}" style="width:11px;height:11px;"></i> ${a.session_tag.replace(/^prog/, "Prog ").replace(/^lab/, "Lab ")}</span>`
      : "";
    left.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;flex-wrap:wrap;">
        <span class="type-badge type-badge--${a.type}">
          <i data-lucide="${icon}" style="width:11px;height:11px;"></i> ${label}
        </span>
        ${sessionBadge}
        <span class="status-pill ${isOpen ? "open" : "closed"}">
          ${isOpen
            ? `<i data-lucide="circle" style="width:7px;height:7px;fill:currentColor;"></i> Live`
            : `<i data-lucide="circle" style="width:7px;height:7px;fill:currentColor;color:var(--muted)"></i> Closed`}
        </span>
      </div>
      <div style="font-size:0.93rem;font-weight:500;line-height:1.4;">${escapeHTML(a.prompt)}</div>
      <div class="meta" style="margin-top:0.2rem;">
        <i data-lucide="clock" style="width:11px;height:11px;vertical-align:middle;"></i>
        ${fmtDate(a.created_at)}
        <span style="color:var(--border-strong);margin:0 0.3rem;">·</span>
        <span style="color:var(--muted);font-size:0.78rem;">#${a.activity_id}</span>
        ${formatScheduleInfo(a)}
      </div>`;
    left.append();

    const actions = document.createElement("div");
    actions.className = "row";
    actions.style.gap = "0.3rem";

    const toggle = document.createElement("button");
    toggle.className = isOpen ? "secondary sm" : "sm";
    toggle.style.minWidth = "72px";
    toggle.innerHTML = isOpen
      ? `<i data-lucide="lock" style="width:12px;height:12px;"></i> Close`
      : `<i data-lucide="lock-open" style="width:12px;height:12px;"></i> Open`;
    toggle.addEventListener("click", () => toggleStatus(a));

    const view = document.createElement("button");
    view.className = "secondary sm";
    view.innerHTML = a.type === "submission"
      ? `<i data-lucide="list" style="width:12px;height:12px;"></i> Responses`
      : `<i data-lucide="bar-chart-2" style="width:12px;height:12px;"></i> Results`;
    view.addEventListener("click", () => showLiveResults(a));

    const editBtn = document.createElement("button");
    editBtn.className = "secondary sm";
    editBtn.innerHTML = `<i data-lucide="edit-2" style="width:13px;height:13px;"></i>`;
    editBtn.title = "Edit prompt";
    editBtn.setAttribute("aria-label", `Edit activity: ${a.prompt}`);
    editBtn.addEventListener("click", () => {
      $("edit-activity-id").value = a.activity_id;
      $("edit-activity-type-val").value = a.type;
      $("edit-activity-prompt").value = a.prompt;

      // Populate poll options if applicable
      const isPoll = a.type === "poll" || a.type === "poll_pie";
      const editOptContainer = $("edit-poll-options-container");
      const editOptList = $("edit-poll-options-list");
      editOptList.innerHTML = "";
      if (isPoll) {
        editOptContainer.hidden = false;
        let opts = [];
        try { opts = a.poll_options ? JSON.parse(a.poll_options) : []; } catch { opts = []; }
        if (!opts.length) opts = ["", ""];
        opts.forEach(v => addOptionRow("edit-poll-options-list", v));
      } else {
        editOptContainer.hidden = true;
      }

      show("modal-edit-activity");
      show("modal-overlay");
      if (window.lucide) window.lucide.createIcons();
    });

    const qrBtn = document.createElement("button");
    qrBtn.className = "secondary sm";
    qrBtn.innerHTML = `<i data-lucide="qr-code" style="width:13px;height:13px;"></i>`;
    qrBtn.title = "QR Code / Copy link";
    qrBtn.setAttribute("aria-label", `Show QR code for: ${a.prompt}`);
    qrBtn.addEventListener("click", () => showQR(a));

    const delBtn2 = document.createElement("button");
    delBtn2.className = "secondary sm danger";
    delBtn2.innerHTML = `<i data-lucide="trash-2" style="width:13px;height:13px;"></i>`;
    delBtn2.title = "Delete activity";
    delBtn2.setAttribute("aria-label", `Delete activity: ${a.prompt}`);
    delBtn2.addEventListener("click", async () => {
      if (!confirm(`Delete "${a.prompt}"?\nThis also removes all submissions and votes.`)) return;
      try {
        await api.deleteActivity(a.activity_id);
        loadActivities();
      } catch (err) {
        alert("Delete failed: " + err.message);
      }
    });

    actions.append(toggle, view, editBtn, qrBtn, delBtn2);
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

  hide("activities");
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

// Build a vertical gradient fill for a bar chart segment.
// Returns a CanvasGradient that animates from full brand → faded toward the base.
function makeBarGradient(ctx, baseHex) {
  const h = ctx.canvas.height || 380;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, baseHex);
  g.addColorStop(1, `${baseHex}cc`);
  return g;
}

// Read theme-aware colors at call time so the chart restyles when the theme changes.
function themePalette() {
  const cs = getComputedStyle(document.documentElement);
  const brand = cs.getPropertyValue("--brand").trim() || "#2563eb";
  const success = cs.getPropertyValue("--success").trim() || "#16a34a";
  const warning = cs.getPropertyValue("--warning").trim() || "#d97706";
  const error = cs.getPropertyValue("--error").trim() || "#dc2626";
  const muted = cs.getPropertyValue("--muted").trim() || "#6b7280";
  const text = cs.getPropertyValue("--text").trim() || "#111827";
  const border = cs.getPropertyValue("--border").trim() || "#e5e7eb";
  return {
    series: [brand, success, warning, error, "#7c3aed", "#0891b2", "#f43f5e", "#65a30d"],
    muted, text, border, brand,
  };
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
    canvas.style.maxHeight = "420px";
    container.appendChild(canvas);
  }

  const isPie = a.type === "poll_pie";
  const palette = themePalette();
  const ctx = canvas.getContext("2d");
  const colors = palette.series.slice(0, options.length).map(c => isPie ? c : makeBarGradient(ctx, c));

  // In-place update path: when the chart already exists AND the structure
  // (option labels) hasn't changed, just mutate data + colors and call
  // .update() — Chart.js animates the bars smoothly instead of flashing.
  const sameShape =
    liveChart &&
    liveChart.config.type === (isPie ? "doughnut" : "bar") &&
    liveChart.data.labels.length === options.length &&
    liveChart.data.labels.every((l, i) => l === options[i]);

  if (sameShape) {
    liveChart.data.datasets[0].data = counts;
    liveChart.data.datasets[0].backgroundColor = colors;
    liveChart.update("none"); // no animation on the refresh tick to avoid jank
    return;
  }

  if (liveChart) liveChart.destroy();
  liveChart = new Chart(ctx, {
    type: isPie ? "doughnut" : "bar",
    data: {
      labels: options,
      datasets: [{
        label: "Votes",
        data: counts,
        backgroundColor: colors,
        borderRadius: isPie ? 0 : 8,
        borderWidth: isPie ? 2 : 0,
        borderColor: isPie ? (getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff") : "transparent",
        borderSkipped: false,
        hoverOffset: isPie ? 8 : 0,
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
          labels: { color: palette.text, font: { size: 12, weight: "500" }, padding: 12, boxWidth: 14, boxHeight: 14 },
        },
        tooltip: {
          backgroundColor: palette.text,
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (ctx) => {
              const val = ctx.parsed.y ?? ctx.parsed ?? 0;
              const pct = totalVotes ? Math.round((val / totalVotes) * 100) : 0;
              return `${val} vote${val !== 1 ? "s" : ""} · ${pct}%`;
            },
          },
        },
      },
      scales: isPie ? {} : {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: palette.muted, font: { size: 11 } },
          grid: { color: palette.border, drawBorder: false },
        },
        y: {
          ticks: { color: palette.text, font: { size: 12, weight: "500" } },
          grid: { display: false, drawBorder: false },
        },
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
  const ctx = canvas.getContext("2d");
  const palette = themePalette();

  if (ratingHistChart) {
    ratingHistChart.data.datasets[0].data = buckets;
    ratingHistChart.update("none");
    return;
  }

  ratingHistChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["1","2","3","4","5","6","7","8","9","10"],
      datasets: [{
        label: "Responses",
        data: buckets,
        backgroundColor: makeBarGradient(ctx, palette.brand),
        borderRadius: 6,
        borderWidth: 0,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: palette.text,
          titleColor: "#fff",
          bodyColor: "#fff",
          displayColors: false,
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: (items) => `Rating ${items[0]?.label}`,
            label: (c) => `${c.parsed.y} response${c.parsed.y !== 1 ? "s" : ""}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: palette.muted, font: { size: 11 } },
          grid: { display: false, drawBorder: false },
          title: { display: true, text: "Rating (1–10)", color: palette.muted, font: { size: 11, weight: "600" } },
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: palette.muted, font: { size: 11 } },
          grid: { color: palette.border, drawBorder: false },
        },
      },
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
  show("activities");
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

$("edit-add-option-btn").addEventListener("click", () => addOptionRow("edit-poll-options-list"));

$("edit-activity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("edit-activity-id").value;
  const type = $("edit-activity-type-val").value;
  const prompt = $("edit-activity-prompt").value.trim();

  const payload = { prompt };

  if (type === "poll" || type === "poll_pie") {
    const options = getOptionValues("edit-poll-options-list");
    if (options.length < 2) {
      setStatus("edit-activity-status", "At least 2 options required", "error");
      return;
    }
    payload.poll_options = options;
  }

  setStatus("edit-activity-status", "Saving…");
  try {
    await api.updateActivity(id, payload);
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

if (session.token) {
  // Verify token is still valid. api.js already clears session on 401.
  // On any other error (network/500) we still enter the dashboard —
  // a temporary server issue must not log the user out.
  api.getStats()
    .then(() => enterDashboard())
    .catch(() => {
      if (session.token) enterDashboard();   // token survived → still valid
      else showSignIn();                      // api.js cleared it → 401
    });
} else {
  showSignIn();
}
