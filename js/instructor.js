import { api, session, API_BASE_URL } from "/js/api.js?v=91";
import {
  $, show, hide, escapeHTML, setStatus,
  mountSettingsDrawer, updateUserPill, setupMicrosoftSignIn,
  toast, confirmDialog,
} from "/js/ui.js?v=91";
import { startDueCountdowns, dueChipHTML, dueLabel } from "/js/due-countdown.js?v=91";

// ---- Max-attempts picker ------------------------------------------------
// Renders a row of preset chips ([1] [2] [3] [5] [∞]) plus a Custom input.
// Storage is on the root element's `dataset.value`:
//   "" / "0"   → unlimited (server treats as NULL)
//   "1".."999" → cap
// readAttemptsPicker(rootEl) → null (unlimited) | integer cap
const ATTEMPT_PRESETS = [1, 2, 3, 5];
function attemptsPickerHTML(currentValue) {
  const cur = (currentValue == null || currentValue <= 0) ? 0 : Number(currentValue);
  const isPreset = cur === 0 || ATTEMPT_PRESETS.includes(cur);
  const chips = [
    ...ATTEMPT_PRESETS.map(v => `<button type="button" class="attempts-chip${cur === v ? " active" : ""}" data-val="${v}">${v}</button>`),
    `<button type="button" class="attempts-chip${cur === 0 ? " active" : ""}" data-val="0" title="Unlimited attempts">∞</button>`,
  ].join("");
  return `
    <div class="attempts-picker" data-value="${cur}">
      ${chips}
      <input type="number" class="attempts-custom" min="1" max="999" step="1"
             placeholder="Custom" value="${!isPreset ? cur : ""}" aria-label="Custom attempt count" />
    </div>`;
}
function bindAttemptsPicker(root) {
  if (!root || root._attemptsBound) return;
  root._attemptsBound = true;
  const custom = root.querySelector(".attempts-custom");
  root.querySelectorAll(".attempts-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".attempts-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      root.dataset.value = btn.dataset.val;
      if (custom) custom.value = "";
    });
  });
  if (custom) {
    custom.addEventListener("input", () => {
      const v = parseInt(custom.value, 10);
      if (Number.isFinite(v) && v >= 1) {
        root.dataset.value = String(Math.min(v, 999));
        root.querySelectorAll(".attempts-chip").forEach(b => b.classList.remove("active"));
        // Light up matching preset if there is one.
        const match = root.querySelector(`.attempts-chip[data-val="${root.dataset.value}"]`);
        if (match) match.classList.add("active");
      }
    });
  }
}
function setAttemptsPicker(root, value) {
  if (!root) return;
  const v = (value == null || value <= 0) ? 0 : Number(value);
  root.dataset.value = String(v);
  const custom = root.querySelector(".attempts-custom");
  root.querySelectorAll(".attempts-chip").forEach(b => b.classList.toggle("active", parseInt(b.dataset.val, 10) === v));
  const isPreset = v === 0 || ATTEMPT_PRESETS.includes(v);
  if (custom) custom.value = isPreset ? "" : v;
}
function readAttemptsPicker(root) {
  if (!root) return null;
  const v = parseInt(root.dataset.value || "0", 10);
  return (!Number.isFinite(v) || v <= 0) ? null : v;
}

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
  // Mount the inline max-attempts picker once the dashboard becomes
  // visible (the host element is hidden behind the signin gate before this).
  const newPicker = $("max-attempts-picker");
  if (newPicker && !newPicker.firstElementChild) {
    newPicker.innerHTML = attemptsPickerHTML(1);
    bindAttemptsPicker(newPicker.firstElementChild);
  }
  loadStats();
  loadClasses();
  loadCategories();
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
    if (!res.roster.length) { toast("No students in database.", "warning"); return; }
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
    toast("Export failed: " + err.message, "error");
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
    toast(err.message, "error");
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
    info.innerHTML = `
      <strong>${escapeHTML(c.code || "")} ${escapeHTML(c.name)}</strong>
      ${c.join_code ? `<span class="muted" style="margin-left:0.5rem;font-family:var(--font-mono);font-size:0.78rem;">join: <strong style="color:var(--brand);">${escapeHTML(c.join_code)}</strong></span>` : ""}
    `;
    const actions = document.createElement("div");
    actions.className = "row";

    const rosterBtn = document.createElement("button");
    rosterBtn.className = "secondary sm";
    rosterBtn.innerHTML = `<i data-lucide="users" style="width:13px;height:13px;"></i> Roster`;
    rosterBtn.addEventListener("click", () => showStudentMgmt(c));

    const qrBtn = document.createElement("button");
    qrBtn.className = "secondary sm";
    qrBtn.innerHTML = `<i data-lucide="qr-code" style="width:13px;height:13px;"></i> Join QR`;
    qrBtn.title = "Share a QR code students can scan to self-enroll";
    qrBtn.addEventListener("click", () => showClassJoinQR(c));

    const statsBtn = document.createElement("button");
    statsBtn.className = "secondary sm";
    statsBtn.innerHTML = `<i data-lucide="bar-chart-3" style="width:13px;height:13px;"></i> Stats`;
    statsBtn.title = "Per-activity correctness across this class";
    statsBtn.addEventListener("click", () => showClassDetail(c));

    const exportBtn = document.createElement("a");
    exportBtn.className = "button secondary sm";
    exportBtn.href = api.exportClassUrl(c.id);
    exportBtn.target = "_blank";
    exportBtn.rel = "noopener";
    // Append the auth token as a query param so the static <a> works
    // even though the API expects a Bearer header normally. We don't —
    // export endpoint reads the Authorization header. Use a fetch instead.
    exportBtn.removeAttribute("href");
    exportBtn.role = "button";
    exportBtn.innerHTML = `<i data-lucide="download" style="width:13px;height:13px;"></i> CSV`;
    exportBtn.title = "Export the class to CSV";
    exportBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const url = api.exportClassUrl(c.id);
        const r = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const blob = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `class-${c.code || c.id}-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) { toast("Export failed: " + err.message, "error"); }
    });

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
      const ok = await confirmDialog({
        title: "Delete this class?",
        message: `<strong>${escapeHTML(c.code || "")} ${escapeHTML(c.name)}</strong><br>This removes the class plus its students and activities. <strong>Cannot be undone.</strong>`,
        confirmLabel: "Delete class",
        cancelLabel: "Keep",
        danger: true,
      });
      if (!ok) return;
      try { await api.deleteClass(c.id); loadClasses(); }
      catch (err) { toast(err.message, "error"); }
    });

    actions.append(rosterBtn, qrBtn, statsBtn, exportBtn, editBtn, delBtn);
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
$("btn-bulk-passwords").addEventListener("click", async (ev) => {
  if (!activeMgmtClass) return;
  // Shift-click bypasses the confirm and forces rotation of everyone's
  // existing password too. Plain click only fills in missing ones.
  const force = !!(ev && ev.shiftKey);
  const ok = await confirmDialog({
    title: force ? "Rotate every password?" : "Generate passwords for the class?",
    message: force
      ? `This will <strong>overwrite the existing password</strong> for every student in <strong>${escapeHTML(activeMgmtClass.name)}</strong>. Old passwords will stop working immediately.`
      : `Generate a password for every student in <strong>${escapeHTML(activeMgmtClass.name)}</strong> who doesn't already have one. Existing passwords are left alone. <em>Hold Shift while clicking to force-rotate everyone instead.</em>`,
    confirmLabel: force ? "Rotate all" : "Generate",
    danger: force,
  });
  if (!ok) return;
  const btn = $("btn-bulk-passwords");
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const res = await api.bulkGeneratePasswords(activeMgmtClass.id, force);
    showBulkPasswordsResult(res.generated, res.skipped, activeMgmtClass);
  } catch (err) {
    toast("Bulk password generation failed: " + err.message, "error");
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
    toast(err.message, "error");
  }
});

// ---- Edit-activity modal (full edit: prompt, options, correct answer,
//      category, status, schedule). Opened from the Activities list. ----
function openEditActivity(a) {
  $("edit-activity-id").value = a.activity_id;
  $("edit-activity-type-val").value = a.type;
  $("edit-activity-prompt").value = a.prompt;
  $("edit-activity-status-select").value = a.status === "open" ? "open" : "closed";

  // Rebuild the category dropdown from current cache + select the
  // activity's current tag.
  const sel = $("edit-session-tag");
  sel.innerHTML = `<option value="">— none —</option>`
    + categoriesCache.map(c => `<option value="${escapeHTML(c.slug)}">${escapeHTML(c.name)}</option>`).join("");
  if (a.session_tag) sel.value = a.session_tag;

  // Options (with correct-answer checkboxes for poll types).
  const optionTypes = new Set(["poll", "poll_pie", "poll_multi", "ordering"]);
  const editOptContainer = $("edit-poll-options-container");
  const editOptLabel = $("edit-poll-options-label");
  const editOptList = $("edit-poll-options-list");
  editOptList.innerHTML = "";
  if (optionTypes.has(a.type)) {
    editOptContainer.hidden = false;
    editOptLabel.innerHTML = a.type === "ordering"
      ? `Items in <strong>correct order</strong> <span class="muted" style="font-weight:400;">(students will see them shuffled)</span>`
      : `Options <span class="muted" style="font-weight:400;">(check the ✓ next to correct answer${a.type === "poll_multi" ? "s" : ""})</span>`;
    let opts = [];
    try { opts = a.poll_options ? JSON.parse(a.poll_options) : []; } catch { opts = []; }
    if (!opts.length) opts = ["", ""];
    opts.forEach(v => addOptionRow("edit-poll-options-list", v));
    // Pre-check correctness toggles based on stored correct_answer.
    let correct = null;
    try { correct = a.correct_answer ? JSON.parse(a.correct_answer) : null; } catch {}
    const rows = editOptList.querySelectorAll(".option-row");
    if (correct) {
      const idxs = typeof correct.index === "number" ? [correct.index] :
                   Array.isArray(correct.indices) ? correct.indices : [];
      idxs.forEach(i => {
        const cb = rows[i]?.querySelector(".option-correct");
        if (cb) cb.checked = true;
      });
    }
    // Hide the ✓ toggle for ordering (correctness is implicit).
    if (a.type === "ordering") {
      editOptList.querySelectorAll(".option-correct-toggle").forEach(el => el.style.display = "none");
    }
  } else {
    editOptContainer.hidden = true;
  }

  // Schedule inputs — destroy any old flatpickr first so re-opening
  // doesn't stack instances or keep a stale picked date.
  ["edit-release-at", "edit-due-at"].forEach(id => {
    const el = $(id);
    if (el._flatpickr) el._flatpickr.destroy();
    el.value = "";
    delete el.dataset.epochMs;
    if (window.flatpickr) {
      window.flatpickr(el, {
        enableTime: true, time_24hr: true, minuteIncrement: 5,
        dateFormat: "Y-m-d H:i",
        onChange: (sel) => { el.dataset.epochMs = sel?.[0] ? sel[0].getTime() : ""; },
      });
    }
  });
  if (a.release_at) {
    const el = $("edit-release-at");
    if (el._flatpickr) el._flatpickr.setDate(new Date(a.release_at), true);
    el.dataset.epochMs = String(a.release_at);
  }
  if (a.due_at) {
    const el = $("edit-due-at");
    if (el._flatpickr) el._flatpickr.setDate(new Date(a.due_at), true);
    el.dataset.epochMs = String(a.due_at);
  }

  // Mount or refresh the max-attempts chip picker inside the edit modal.
  const editPickerHost = $("edit-max-attempts-picker");
  if (editPickerHost) {
    if (!editPickerHost.firstElementChild) {
      editPickerHost.innerHTML = attemptsPickerHTML(a.max_attempts);
      bindAttemptsPicker(editPickerHost.firstElementChild);
    } else {
      setAttemptsPicker(editPickerHost.firstElementChild, a.max_attempts);
    }
  }

  // Per-student assignment — comma-separated list, one or many emails.
  const assignEl = $("edit-assign-to-email");
  if (assignEl) {
    // Reformat the stored CSV onto separate lines for readability.
    const emails = (a.assigned_to_email || "").split(",").filter(Boolean);
    assignEl.value = emails.join(", ");
    refreshAssignHint(assignEl, $("edit-assign-to-email-hint"));
  }

  // Show-results toggle (default 1 if column missing / migration not applied).
  const showResEl = $("edit-show-results");
  if (showResEl) showResEl.checked = a.show_results === undefined ? true : a.show_results === 1;

  show("modal-edit-activity");
  show("modal-overlay");
  if (window.lucide) window.lucide.createIcons();
}

// ---- Join QR / Stats / Student detail modals ----
function ensureCenterModal(id, widthPx = 480) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement("div");
    m.id = id;
    m.className = "modal-center";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    document.body.appendChild(m);
  }
  m.style.maxWidth = widthPx + "px";
  return m;
}

function showClassJoinQR(c) {
  if (!c.join_code) { toast("This class has no join code yet — re-create it.", "warning"); return; }
  const m = ensureCenterModal("modal-class-qr", 420);
  const joinUrl = `${location.origin}/?join=${encodeURIComponent(c.join_code)}`;
  m.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;">
      <h2 style="margin:0;font-size:1.05rem;">Join ${escapeHTML(c.name)}</h2>
      <button id="close-class-qr" class="icon-btn" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    </div>
    <div id="class-qr-target" style="display:flex;justify-content:center;padding:0.85rem;background:#fff;border-radius:var(--radius);margin-bottom:0.85rem;"></div>
    <div style="text-align:center;margin-bottom:0.5rem;">
      <span class="muted" style="font-size:0.8rem;">Join code</span>
      <div style="font-family:var(--font-mono);font-weight:800;font-size:1.6rem;letter-spacing:0.15em;color:var(--brand);">${escapeHTML(c.join_code)}</div>
    </div>
    <div style="display:flex;gap:0.4rem;">
      <input type="text" id="class-qr-url" readonly value="${escapeHTML(joinUrl)}" style="flex:1;font-family:var(--font-mono);font-size:0.78rem;" />
      <button id="class-qr-copy" class="secondary sm"><i data-lucide="copy" style="width:13px;height:13px;"></i></button>
    </div>`;
  show("modal-overlay");
  m.hidden = false;
  if (window.QRCode) new window.QRCode(document.getElementById("class-qr-target"), { text: joinUrl, width: 220, height: 220 });
  if (window.lucide) window.lucide.createIcons();
  document.getElementById("close-class-qr").addEventListener("click", () => { hide("modal-overlay"); m.hidden = true; });
  document.getElementById("class-qr-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(joinUrl).then(() => toast("Link copied", "success"));
  });
}

async function showClassDetail(c) {
  const m = ensureCenterModal("modal-class-detail", 820);
  m.innerHTML = `<p class="muted" style="padding:1rem;">Loading…</p>`;
  show("modal-overlay");
  m.hidden = false;
  try {
    const r = await api.getClassDetail(c.id);
    const groups = groupByWeek(r.activities);

    // Per-week rollup: total responses, total correct, total gradable.
    function weekStats(items) {
      let resp = 0, correct = 0, gradable = 0;
      for (const a of items) {
        resp += a.responders;
        correct += a.correct;
        gradable += Math.max(0, a.responders - a.ungraded);
      }
      const pct = gradable > 0 ? Math.round(100 * correct / gradable) : null;
      return { resp, correct, gradable, pct };
    }

    const sections = groups.map(g => {
      const ws = weekStats(g.items);
      const rows = g.items.map(a => `
        <tr>
          <td style="max-width:340px;">${escapeHTML(a.prompt.slice(0, 120))}${a.prompt.length > 120 ? "…" : ""}</td>
          <td>${escapeHTML(a.type)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${a.responders} / ${r.total_students}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${a.accuracy_pct == null ? "—" : a.accuracy_pct + "%"}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${a.correct}${a.ungraded ? ` <span class="muted">(${a.ungraded})</span>` : ""}</td>
        </tr>`).join("");
      return `
        <details class="week-section">
          <summary>
            <span class="week-section-title">${escapeHTML(g.label)}</span>
            <span class="week-section-meta">
              ${g.items.length} activit${g.items.length === 1 ? "y" : "ies"}
              · ${ws.resp} response${ws.resp === 1 ? "" : "s"}
              · ${ws.pct == null ? "—" : ws.pct + "%"} accuracy
            </span>
          </summary>
          <table style="margin:0;font-size:0.82rem;">
            <thead><tr><th>Prompt</th><th>Type</th><th style="text-align:right;">Responders</th><th style="text-align:right;">Accuracy</th><th style="text-align:right;">Correct</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>`;
    }).join("");

    m.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;">
        <h2 style="margin:0;">${escapeHTML(c.code || "")} ${escapeHTML(c.name)} — stats</h2>
        <button id="close-class-detail" class="icon-btn" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
      </div>
      <p class="muted" style="font-size:0.85rem;margin:0 0 0.85rem;"><strong>${r.total_students}</strong> students · <strong>${r.activities.length}</strong> activities · click any week to expand</p>
      <div style="max-height:60vh;overflow:auto;">
        ${sections || `<p class="muted">No activities yet.</p>`}
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    document.getElementById("close-class-detail").addEventListener("click", () => { hide("modal-overlay"); m.hidden = true; });
  } catch (err) {
    m.innerHTML = `<p style="padding:1rem;color:var(--error);">Couldn't load: ${escapeHTML(err.message)}</p>`;
  }
}

async function showStudentDetail(classId, student) {
  const m = ensureCenterModal("modal-student-detail", 820);
  m.innerHTML = `<p class="muted" style="padding:1rem;">Loading…</p>`;
  show("modal-overlay");
  m.hidden = false;
  try {
    const r = await api.getStudentDetail(classId, student.student_email);
    const t = r.totals;
    const pct = (t.total_answered - t.ungraded) > 0
      ? Math.round(100 * t.correct / (t.total_answered - t.ungraded)) : null;

    // Build a single row for one activity (used inside each week section).
    function rowFor(a) {
      let ans = "—", correct = "—";
      if (a.answered) {
        if (a.student_answer.poll_indices && a.poll_options) {
          ans = [...a.student_answer.poll_indices].sort()
            .map(i => escapeHTML(a.poll_options[i] || String(i))).join(" · ");
        } else if (a.student_answer.submission != null) {
          ans = `<code>${escapeHTML(a.student_answer.submission)}</code>`;
        }
      }
      if (a.correct_answer && a.poll_options) {
        if (a.correct_answer.index != null) correct = escapeHTML(a.poll_options[a.correct_answer.index] || "");
        else if (Array.isArray(a.correct_answer.indices)) correct = a.correct_answer.indices.map(i => escapeHTML(a.poll_options[i] || "")).join(" · ");
      } else if (a.type === "ordering") correct = "canonical order";
      const mark = a.is_correct === true ? `<span style="color:var(--success);">✓</span>`
                 : a.is_correct === false ? `<span style="color:var(--error);">✗</span>`
                 : `<span class="muted">—</span>`;
      return `
        <tr>
          <td style="max-width:300px;">${escapeHTML(a.prompt.slice(0,100))}${a.prompt.length>100?"…":""}</td>
          <td style="font-size:0.82rem;">${ans}</td>
          <td style="font-size:0.82rem;color:var(--muted);">${correct}</td>
          <td style="text-align:center;font-weight:700;">${mark}</td>
        </tr>`;
    }

    // Per-week rollup: how many they answered + correct in that week.
    function weekRollup(items) {
      let ans = 0, corr = 0, ung = 0;
      for (const a of items) {
        if (a.answered) ans++;
        if (a.is_correct === true) corr++;
        if (a.answered && a.is_correct === null) ung++;
      }
      const gradable = ans - ung;
      return { ans, total: items.length, corr, ung, pct: gradable > 0 ? Math.round(100 * corr / gradable) : null };
    }

    const groups = groupByWeek(r.activities);
    const sections = groups.map(g => {
      const w = weekRollup(g.items);
      return `
        <details class="week-section">
          <summary>
            <span class="week-section-title">${escapeHTML(g.label)}</span>
            <span class="week-section-meta">
              ${w.ans}/${w.total} answered ·
              <strong style="color:var(--success);">${w.corr}</strong> correct${w.pct != null ? ` (${w.pct}%)` : ""}${w.ung ? ` · ${w.ung} ungraded` : ""}
            </span>
          </summary>
          <table style="margin:0;font-size:0.82rem;">
            <thead><tr><th>Prompt</th><th>Their answer</th><th>Correct</th><th style="text-align:center;">OK</th></tr></thead>
            <tbody>${g.items.map(rowFor).join("")}</tbody>
          </table>
        </details>`;
    }).join("");

    m.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;">
        <h2 style="margin:0;">${escapeHTML(student.student_email)}</h2>
        <button id="close-student-detail" class="icon-btn" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
      </div>
      <p class="muted" style="font-size:0.85rem;margin:0 0 0.85rem;">
        Answered <strong>${t.total_answered}</strong> of <strong>${t.total_activities}</strong> ·
        Correct <strong style="color:var(--success);">${t.correct}</strong>${pct != null ? ` (${pct}%)` : ""}${t.ungraded ? ` · <strong>${t.ungraded}</strong> ungraded` : ""}
      </p>
      <div style="max-height:60vh;overflow:auto;">
        ${sections || `<p class="muted">No activities in this class.</p>`}
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    document.getElementById("close-student-detail").addEventListener("click", () => { hide("modal-overlay"); m.hidden = true; });
  } catch (err) {
    m.innerHTML = `<p style="padding:1rem;color:var(--error);">Couldn't load: ${escapeHTML(err.message)}</p>`;
  }
}

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
      const responses = (s.submission_count || 0) + (s.vote_count || 0);
      const pwDot = s.has_password
        ? `<span title="Password set" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--success);margin-right:0.4rem;"></span>`
        : `<span title="No password yet" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--subtle);margin-right:0.4rem;"></span>`;
      const headerDiv = document.createElement("div");
      headerDiv.style.cursor = "pointer";
      headerDiv.title = "Click for full activity breakdown";
      headerDiv.innerHTML = `
        ${pwDot}<strong>${escapeHTML(s.student_email)}</strong>
        ${s.student_name ? `<span class="muted"> · ${escapeHTML(s.student_name)}</span>` : ""}
        ${s.student_id ? `<span class="muted"> · ${escapeHTML(s.student_id)}</span>` : ""}
        <div class="meta" style="margin-top:0.2rem;">
          <span style="color:var(--brand);font-weight:600;">${responses}</span>
          response${responses === 1 ? "" : "s"}
          (${s.vote_count || 0} poll · ${s.submission_count || 0} submission${(s.submission_count||0) === 1 ? "" : "s"})
        </div>`;
      headerDiv.addEventListener("click", () => showStudentDetail(activeMgmtClass.id, s));
      li.appendChild(headerDiv);

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
          toast("Could not generate password: " + err.message, "error");
        } finally {
          pwBtn.disabled = false;
        }
      });

      const delBtn = document.createElement("button");
      delBtn.className = "secondary sm danger";
      delBtn.innerHTML = `<i data-lucide="user-minus" style="width:13px;height:13px;"></i> Remove`;
      delBtn.title = `Remove ${s.student_email}`;
      delBtn.setAttribute("aria-label", `Remove student ${s.student_email}`);
      delBtn.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Remove student?",
          message: `Remove <strong>${escapeHTML(s.student_email)}</strong> from <strong>${escapeHTML(activeMgmtClass.name)}</strong>?`,
          confirmLabel: "Remove",
          danger: true,
        });
        if (!ok) return;
        try { await api.removeClassStudent(activeMgmtClass.id, s.student_email); loadClassStudents(); }
        catch (err) { toast(err.message, "error"); }
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
    const t = btn.dataset.type;
    $("activity-type").value = t;
    // Poll, multi-poll, pie, and ordering all use the options builder.
    const needsOptions = t === "poll" || t === "poll_multi" || t === "poll_pie" || t === "ordering";
    if (needsOptions) {
      show("poll-options-container");
      // Relabel hint based on type
      const label = $("poll-options-container").querySelector("label");
      if (label) {
        label.innerHTML = t === "ordering"
          ? `Items in <strong>correct order</strong> <span class="muted" style="font-weight:400;">(students will see them shuffled)</span>`
          : `Options <span class="muted" style="font-weight:400;">(min 2, max 8)</span>`;
      }
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
    <label class="option-correct-toggle" title="Mark as a correct answer">
      <input type="checkbox" class="option-correct" aria-label="Mark option ${LETTERS[idx] || idx + 1} correct" />
      <span>✓</span>
    </label>
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

// Read which option indices the instructor marked correct.
function getCorrectIndices(containerId) {
  return [...$(containerId).querySelectorAll(".option-row")]
    .map((r, i) => r.querySelector(".option-correct").checked ? i : -1)
    .filter(i => i >= 0);
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

// Inline "+ New category…" from the New Activity dropdown opens a small
// prompt-style modal asking for a slug + name, creates it, and selects it.
$("session-tag")?.addEventListener("change", async (e) => {
  if (e.target.value !== "__new__") return;
  e.target.value = "";
  const created = await openCreateCategoryDialog();
  if (created) {
    await loadCategories();
    $("session-tag").value = created.slug;
  }
});

function openCreateCategoryDialog(defaults = {}) {
  return new Promise((resolve) => {
    let m = document.getElementById("modal-new-category");
    if (!m) {
      m = document.createElement("div");
      m.id = "modal-new-category";
      m.className = "modal-center";
      m.setAttribute("role", "dialog");
      m.setAttribute("aria-modal", "true");
      m.style.maxWidth = "420px";
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <h3 style="margin:0 0 0.5rem;font-size:1.05rem;">New category</h3>
      <p class="muted" style="margin:0 0 1rem;font-size:0.88rem;">A short slug (letters / numbers / dashes) and a display name. The slug is what gets stored on each activity — pick something stable.</p>
      <div class="field"><label>Slug</label>
        <input type="text" id="cat-slug" placeholder="midterm-review" value="${escapeHTML(defaults.slug || "")}" pattern="[a-z0-9_-]+" />
      </div>
      <div class="field"><label>Display name</label>
        <input type="text" id="cat-name" placeholder="Midterm review" value="${escapeHTML(defaults.name || "")}" />
      </div>
      <div id="cat-err" class="status" role="status"></div>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.85rem;">
        <button type="button" class="secondary sm" id="cat-cancel">Cancel</button>
        <button type="button" id="cat-ok">Create</button>
      </div>`;
    show("modal-overlay");
    m.hidden = false;
    const close = (v) => { hide("modal-overlay"); m.hidden = true; resolve(v); };
    document.getElementById("cat-cancel").addEventListener("click", () => close(null));
    document.getElementById("cat-slug").focus();
    document.getElementById("cat-ok").addEventListener("click", async () => {
      const slug = document.getElementById("cat-slug").value.trim().toLowerCase();
      const name = document.getElementById("cat-name").value.trim();
      if (!/^[a-z0-9_-]{1,40}$/.test(slug)) {
        setStatus("cat-err", "Slug must be lowercase letters, digits, dashes, or underscores.", "error"); return;
      }
      if (!name) { setStatus("cat-err", "Name is required.", "error"); return; }
      try {
        const r = await api.createCategory(slug, name);
        close(r);
      } catch (err) {
        setStatus("cat-err", err.message || "Couldn't create", "error");
      }
    });
  });
}

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

// Inline validity counter for the "Assign to specific students"
// textarea. Updates a sibling .muted hint with "3 valid · 1 invalid".
function refreshAssignHint(textarea, hintEl) {
  if (!textarea || !hintEl) return;
  const raw = textarea.value;
  if (!raw.trim()) { hintEl.textContent = "Visible to the whole class."; hintEl.style.color = ""; return; }
  const parts = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const valid = new Set();
  const invalid = [];
  for (const p of parts) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)) valid.add(p.toLowerCase());
    else invalid.push(p);
  }
  const bits = [`${valid.size} valid email${valid.size === 1 ? "" : "s"}`];
  if (invalid.length) bits.push(`${invalid.length} invalid (will be ignored): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`);
  hintEl.textContent = bits.join(" · ");
  hintEl.style.color = invalid.length ? "var(--warning, #b45309)" : "";
}
// Bind the hint to both the new-activity and edit-activity textareas.
["assign-to-email", "edit-assign-to-email"].forEach(id => {
  const ta = $(id);
  const hint = $(`${id}-hint`);
  if (!ta || !hint) return;
  ta.addEventListener("input", () => refreshAssignHint(ta, hint));
  ta.addEventListener("blur", () => {
    // Normalize whitespace on blur so the displayed value matches the
    // canonical form the server will store.
    const parts = ta.value.split(/[,\s;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const unique = [...new Set(parts.filter(p => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)))];
    if (unique.length) ta.value = unique.join(", ");
    refreshAssignHint(ta, hint);
  });
  refreshAssignHint(ta, hint);
});

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
  // Max attempts comes from the chip picker: null = unlimited, N = cap.
  const maxAttempts = readAttemptsPicker(
    $("max-attempts-picker")?.querySelector(".attempts-picker")
  );

  // Per-student assignment. Server normalizes the list, but we send it
  // as-is and let the server filter invalid emails. Blank = whole class.
  const assignedTo = ($("assign-to-email")?.value || "").trim() || null;
  // Live results visible to students (default true).
  const showResults = $("show-results") ? !!$("show-results").checked : true;

  let type = uiType;
  let options = [];

  let correctAnswer = null;
  if (uiType === "poll" || uiType === "poll_multi" || uiType === "poll_pie" || uiType === "ordering") {
    options = getOptionValues("poll-options-list");
    if (options.length < 2) {
      setStatus("new-status", uiType === "ordering"
        ? "Add at least 2 items to order"
        : "Add at least 2 options", "error");
      return;
    }
    if (uiType === "poll" || uiType === "poll_pie") {
      const idxs = getCorrectIndices("poll-options-list");
      if (idxs.length === 1) correctAnswer = { index: idxs[0] };
      else if (idxs.length > 1) {
        setStatus("new-status", "Single-choice polls allow only one correct option (or none, for ungraded).", "error");
        return;
      }
    } else if (uiType === "poll_multi") {
      const idxs = getCorrectIndices("poll-options-list");
      if (idxs.length) correctAnswer = { indices: idxs };
    }
  }

  if (!prompt) return;
  const btn = e.submitter || e.target.querySelector("button[type=submit]");
  if (btn) btn.disabled = true;
  setStatus("new-status", "Creating…");
  try {
    const res = await api.createActivity(prompt, classId, type, options, sessionTag, releaseAt, dueAt, correctAnswer, maxAttempts, assignedTo, showResults);
    setStatus("new-status", `Launched! (#${res.activity_id})`, "success");
    $("prompt").value = "";
    if ($("assign-to-email")) $("assign-to-email").value = "";
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
  list.innerHTML = `<p class="muted" style="padding:1rem;">Loading…</p>`;
  try {
    const res = await api.listAllActivities(currentClassId);
    activitiesCache = res.activities;
    renderActivities(activitiesCache);
  } catch (err) {
    list.innerHTML = `<p class="muted" style="padding:1rem;color:var(--error);">Error: ${escapeHTML(err.message)}</p>`;
  }
}

const TYPE_LABELS = {
  submission: "Submission",
  poll: "Poll",
  poll_pie: "Pie Poll",
  rating: "Rating",
  word_cloud: "Word Cloud",
};

// Categories are user-owned (one row per instructor x slug). Loaded from
// /admin/categories on dashboard mount and refreshed when the instructor
// adds / renames / deletes one.
let categoriesCache = [];  // [{ slug, name, position, activity_count }]

function categoryFor(slug) {
  return slug ? categoriesCache.find(c => c.slug === slug) : null;
}
function categoryLabel(tag) {
  if (!tag) return "Uncategorized";
  const c = categoryFor(tag);
  if (c) return c.name;
  // Legacy fallback for tags that haven't been migrated to a category row
  // (e.g., prog01 or a custom slug not yet seen).
  const m = /^(week|prog|lab)(\d+)$/.exec(tag);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${parseInt(m[2], 10).toString().padStart(2, "0")}`;
  return tag;
}
function categorySortKey(tag) {
  if (!tag) return Number.POSITIVE_INFINITY;
  const c = categoryFor(tag);
  if (c) return c.position;
  // unknown / legacy tags sort after known ones, ordered by their number
  const m = /(\d+)/.exec(tag);
  return 100000 + (m ? parseInt(m[1], 10) : 99999);
}

// Group activities by their session_tag (i.e. category slug). Returns
// [{ tag, label, items }, ...] sorted by category.position.
// Untagged items go in a trailing { tag: null } bucket.
function groupByCategory(items) {
  const groups = new Map();
  for (const it of items) {
    const tag = it.session_tag || null;
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(it);
  }
  return [...groups.entries()]
    .sort((a, b) => categorySortKey(a[0]) - categorySortKey(b[0]))
    .map(([tag, items]) => ({ tag, label: categoryLabel(tag), items }));
}
// Back-compat alias — older code paths still call groupByWeek.
const groupByWeek = groupByCategory;

async function loadCategories() {
  try {
    const r = await api.listCategories();
    categoriesCache = r.categories || [];
  } catch (err) {
    console.error("loadCategories failed", err);
    categoriesCache = [];
  }
  rebuildCategoryDropdowns();
}

// (Re)populate the New-Activity "Week" dropdown + the filter dropdown
// from categoriesCache. An "+ New category…" item is appended to the
// new-activity dropdown so the instructor can create one inline.
function rebuildCategoryDropdowns() {
  const newSel = $("session-tag");
  if (newSel) {
    const prev = newSel.value;
    newSel.innerHTML = `<option value="">— none —</option>`
      + categoriesCache.map(c => `<option value="${escapeHTML(c.slug)}">${escapeHTML(c.name)}</option>`).join("")
      + `<option value="__new__" style="font-style:italic;">+ New category…</option>`;
    if (prev && [...newSel.options].some(o => o.value === prev)) newSel.value = prev;
  }
  const filtSel = $("activity-session-filter");
  if (filtSel) {
    const prev = filtSel.value;
    filtSel.innerHTML = `<option value="">All categories</option>`
      + categoriesCache.map(c => `<option value="${escapeHTML(c.slug)}">${escapeHTML(c.name)}</option>`).join("");
    if (prev && [...filtSel.options].some(o => o.value === prev)) filtSel.value = prev;
  }
}
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
  const parts = [];
  // Release-at stays static — it transitions once and never moves once
  // crossed. Use the existing shortDelta for terse instructor display.
  const now = Date.now();
  if (a.release_at && a.release_at > now) {
    parts.push(`<span class="schedule-pill schedule-pill-release" title="${new Date(a.release_at).toLocaleString()}">Releases in ${shortDelta(a.release_at - now)}</span>`);
  }
  // Due-at gets a live countdown — instructors see it tick down without
  // having to refresh the list. urgency/warn classes are applied by the
  // shared tick in due-countdown.js.
  if (a.due_at) {
    parts.push(dueChipHTML(a.due_at, { className: "schedule-pill schedule-pill-due" }));
  }
  return parts.join("");
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Build a single <li> row for an activity. Extracted so renderActivities
// can use it inside per-week <details> groupings.
function buildActivityRow(a) {
    const li = document.createElement("li");
    li.dataset.type = a.type;
    const left = document.createElement("div");
    const icon = TYPE_ICONS[a.type] || "file-text";
    const label = TYPE_LABELS[a.type] || a.type;
    const isOpen = a.status === "open";
    const sessionBadge = a.session_tag
      ? `<span class="type-badge" style="background:var(--surface-2);color:var(--text);"><i data-lucide="calendar-days" style="width:11px;height:11px;"></i> ${a.session_tag.replace(/^week/, "Week ").replace(/^prog/, "Prog ").replace(/^lab/, "Lab ")}</span>`
      : "";
    const attemptsBadge = (a.max_attempts == null || a.max_attempts <= 0)
      ? `<span class="type-badge" title="Unlimited attempts" style="background:var(--surface-2);color:var(--muted);"><i data-lucide="infinity" style="width:11px;height:11px;"></i> ∞</span>`
      : `<span class="type-badge" title="${a.max_attempts} attempt${a.max_attempts === 1 ? "" : "s"} allowed" style="background:var(--surface-2);color:var(--text);"><i data-lucide="repeat" style="width:11px;height:11px;"></i> ${a.max_attempts}×</span>`;
    // Multi-email assignment: a comma-separated list lives in the
    // column. Show the single email if there's only one, or "N students"
    // (with the full list in the tooltip) when there are multiple.
    const assignedEmails = a.assigned_to_email ? a.assigned_to_email.split(",").filter(Boolean) : [];
    const assignBadge = assignedEmails.length === 0 ? ""
      : assignedEmails.length === 1
        ? `<span class="type-badge" title="Only ${escapeHTML(assignedEmails[0])} can see this" style="background:var(--brand-soft);color:var(--brand);"><i data-lucide="user" style="width:11px;height:11px;"></i> ${escapeHTML(assignedEmails[0])}</span>`
        : `<span class="type-badge" title="Only these students can see this:\n${assignedEmails.map(e => "• " + e).join("\n")}" style="background:var(--brand-soft);color:var(--brand);"><i data-lucide="users" style="width:11px;height:11px;"></i> ${assignedEmails.length} students</span>`;
    const resultsBadge = (a.show_results === 0)
      ? `<span class="type-badge" title="Live results are hidden from students" style="background:var(--warning-soft,var(--surface-2));color:var(--warning,#b45309);"><i data-lucide="eye-off" style="width:11px;height:11px;"></i> Results hidden</span>`
      : "";
    left.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;flex-wrap:wrap;">
        <span class="type-badge type-badge--${a.type}">
          <i data-lucide="${icon}" style="width:11px;height:11px;"></i> ${label}
        </span>
        ${sessionBadge}
        ${attemptsBadge}
        ${assignBadge}
        ${resultsBadge}
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

    // Open a full-screen "presentation mode" page for projection. Reuses
    // the session token from localStorage so no re-auth is needed.
    const presentBtn = document.createElement("button");
    presentBtn.className = "secondary sm";
    presentBtn.title = "Open full-screen presentation view (new tab)";
    presentBtn.setAttribute("aria-label", `Present results for: ${a.prompt}`);
    presentBtn.innerHTML = `<i data-lucide="presentation" style="width:13px;height:13px;"></i>`;
    presentBtn.addEventListener("click", () => {
      window.open(`/present.html?activity=${encodeURIComponent(a.activity_id)}`, "_blank", "noopener");
    });

    const editBtn = document.createElement("button");
    editBtn.className = "secondary sm";
    editBtn.innerHTML = `<i data-lucide="edit-2" style="width:13px;height:13px;"></i>`;
    editBtn.title = "Edit prompt";
    editBtn.setAttribute("aria-label", `Edit activity: ${a.prompt}`);
    editBtn.addEventListener("click", () => openEditActivity(a));

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
      const ok = await confirmDialog({
        title: "Delete activity?",
        message: `<strong>${escapeHTML(a.prompt.slice(0, 140))}${a.prompt.length > 140 ? "…" : ""}</strong><br>All student answers and submissions for this activity will be deleted too. <strong>Cannot be undone.</strong>`,
        confirmLabel: "Delete activity",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteActivity(a.activity_id);
        loadActivities();
      } catch (err) {
        toast("Delete failed: " + err.message, "error");
      }
    });

    actions.append(toggle, view, presentBtn, editBtn, qrBtn, delBtn2);
    li.append(left, actions);
    return li;
}

// Render the activities cache grouped by week. Each week is a <details>
// block whose <summary> shows the topic + a per-week rollup of counts.
function renderActivities(list_data) {
  const root = $("activities");
  root.innerHTML = "";
  if (!list_data.length) {
    root.innerHTML = `<p class="muted" style="padding:1rem;">No activities yet — launch one above.</p>`;
    return;
  }
  for (const g of groupByCategory(list_data)) {
    const openCount = g.items.filter(a => a.status === "open").length;
    const details = document.createElement("details");
    details.className = "week-section";
    details.open = true;
    const summary = document.createElement("summary");
    // Batch buttons (Open / Close / Schedule) appear only when the section
    // is tied to a real category — uncategorized activities don't get them.
    const batchControls = g.tag ? `
      <span class="week-section-actions">
        <button type="button" class="secondary sm" data-bulk-action="open"   data-cat="${escapeHTML(g.tag)}" title="Open every activity in this category">Open all</button>
        <button type="button" class="secondary sm" data-bulk-action="closed" data-cat="${escapeHTML(g.tag)}" title="Close every activity in this category">Close all</button>
        <button type="button" class="secondary sm" data-bulk-action="schedule" data-cat="${escapeHTML(g.tag)}" title="Bulk-edit status, dates, and max attempts for everything in this category">Bulk edit…</button>
      </span>` : "";
    summary.innerHTML = `
      <span class="week-section-title">${escapeHTML(g.label)}</span>
      <span class="week-section-meta">
        ${g.items.length} activit${g.items.length === 1 ? "y" : "ies"}
        ${openCount ? `· <span style="color:var(--success);font-weight:700;">${openCount} open</span>` : ""}
      </span>
      ${batchControls}`;
    details.appendChild(summary);
    const ul = document.createElement("ul");
    ul.className = "activity-list";
    g.items.forEach(a => ul.appendChild(buildActivityRow(a)));
    details.appendChild(ul);
    root.appendChild(details);
  }
  // Wire batch-action buttons inside summaries (one delegated listener
  // would be slightly cleaner; per-button keeps the wiring obvious).
  root.querySelectorAll("[data-bulk-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      // <summary> would toggle <details> on click — stop that.
      e.preventDefault();
      e.stopPropagation();
      handleCategoryBulk(btn.dataset.cat, btn.dataset.bulkAction);
    });
  });
  if (window.lucide) window.lucide.createIcons();
}

async function handleCategoryBulk(slug, action) {
  if (action === "open" || action === "closed") {
    const ok = await confirmDialog({
      title: action === "open" ? "Open every activity?" : "Close every activity?",
      message: `This will set the status of <strong>every</strong> activity tagged <code>${escapeHTML(slug)}</code> to <strong>${action}</strong>.`,
      confirmLabel: action === "open" ? "Open all" : "Close all",
      danger: action === "closed",
    });
    if (!ok) return;
    try {
      const r = await api.bulkUpdateCategory(slug, { status: action });
      toast(`${r.updated} activit${r.updated === 1 ? "y" : "ies"} ${action === "open" ? "opened" : "closed"}.`, "success");
      loadActivities();
    } catch (err) { toast(err.message, "error"); }
    return;
  }
  if (action === "schedule") {
    openBulkScheduleDialog(slug);
  }
}

function openBulkScheduleDialog(slug) {
  let m = document.getElementById("modal-bulk-schedule");
  if (!m) {
    m = document.createElement("div");
    m.id = "modal-bulk-schedule";
    m.className = "modal-center";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.style.maxWidth = "460px";
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <h3 style="margin:0 0 0.5rem;font-size:1.05rem;">Bulk edit “${escapeHTML(slug)}”</h3>
    <p class="muted" style="margin:0 0 1rem;font-size:0.88rem;">Applies to every activity in this category. Each section is optional — leave a control alone and that field stays untouched.</p>
    <div class="field"><label for="bulk-release">Release at</label>
      <input type="text" id="bulk-release" class="datetime-input" placeholder="Pick date &amp; time…" autocomplete="off" />
    </div>
    <div class="field"><label for="bulk-due">Due at</label>
      <input type="text" id="bulk-due" class="datetime-input" placeholder="Pick date &amp; time…" autocomplete="off" />
    </div>
    <fieldset style="border:1px solid var(--border);border-radius:var(--radius);padding:0.6rem 0.85rem;margin:0 0 0.5rem;">
      <legend style="font-size:0.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;padding:0 0.35rem;">Status</legend>
      <label style="display:flex;align-items:center;gap:0.45rem;font-size:0.9rem;margin:0.15rem 0;"><input type="radio" name="bulk-status" value="keep" checked /> Leave as is</label>
      <label style="display:flex;align-items:center;gap:0.45rem;font-size:0.9rem;margin:0.15rem 0;"><input type="radio" name="bulk-status" value="open" /> Open all <span class="muted" style="font-size:0.8rem;">— needed for students to see them</span></label>
      <label style="display:flex;align-items:center;gap:0.45rem;font-size:0.9rem;margin:0.15rem 0;"><input type="radio" name="bulk-status" value="closed" /> Close all</label>
    </fieldset>
    <fieldset style="border:1px solid var(--border);border-radius:var(--radius);padding:0.6rem 0.85rem;margin:0 0 0.5rem;">
      <legend style="font-size:0.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;padding:0 0.35rem;">Max attempts</legend>
      <div id="bulk-attempts-picker-host"></div>
    </fieldset>
    <div id="bulk-visibility-hint" class="muted" style="font-size:0.82rem;margin:0 0 0.4rem;min-height:1.2em;"></div>
    <div id="bulk-err" class="status" role="status"></div>
    <div style="display:flex;justify-content:space-between;gap:0.5rem;margin-top:0.85rem;flex-wrap:wrap;">
      <button type="button" class="secondary sm danger" id="bulk-clear">Clear both dates</button>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="secondary sm" id="bulk-cancel">Cancel</button>
        <button type="button" id="bulk-apply">Apply</button>
      </div>
    </div>
    <details class="danger-zone" style="margin-top:0.85rem;border:1px solid var(--error);border-radius:var(--radius);padding:0.55rem 0.8rem;">
      <summary style="cursor:pointer;color:var(--error);font-weight:600;font-size:0.85rem;">Danger zone</summary>
      <p class="muted" style="margin:0.5rem 0;font-size:0.82rem;">Wipe every recorded response (votes, submissions) and reset attempt counters for <strong>every activity</strong> in this category. The activities themselves are preserved.</p>
      <button type="button" class="secondary sm danger" id="bulk-reset-responses" style="width:100%;">
        <i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i> Reset all responses in this category
      </button>
    </details>`;
  show("modal-overlay");
  m.hidden = false;

  // Bulk picker has a "Leave alone" sentinel as its first chip so the
  // default state is "don't touch the cap". Pick any other chip (or type
  // a custom number) and the value goes on the wire.
  const bulkAttemptsHost = document.getElementById("bulk-attempts-picker-host");
  if (bulkAttemptsHost) {
    bulkAttemptsHost.innerHTML = `
      <div class="attempts-picker" data-value="leave">
        <button type="button" class="attempts-chip active" data-val="leave">Leave alone</button>
        <button type="button" class="attempts-chip" data-val="1">1</button>
        <button type="button" class="attempts-chip" data-val="2">2</button>
        <button type="button" class="attempts-chip" data-val="3">3</button>
        <button type="button" class="attempts-chip" data-val="5">5</button>
        <button type="button" class="attempts-chip" data-val="0" title="Unlimited">∞</button>
        <input type="number" class="attempts-custom" min="1" max="999" step="1" placeholder="Custom" aria-label="Custom attempt count" />
      </div>`;
    const picker = bulkAttemptsHost.firstElementChild;
    bindAttemptsPicker(picker);
  }

  // Wait for Flatpickr if it isn't ready yet, then init on both inputs.
  const initFp = (attempts = 0) => {
    if (!window.flatpickr) {
      if (attempts < 30) return setTimeout(() => initFp(attempts + 1), 100);
      // Give up — the plain <input> still works because we read input.value
      // on apply, so the user isn't locked out.
      return;
    }
    ["bulk-release", "bulk-due"].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el._flatpickr) return;
      window.flatpickr(el, {
        enableTime: true, time_24hr: true, minuteIncrement: 5,
        dateFormat: "Y-m-d H:i",
        onChange: (sel) => { el.dataset.epochMs = sel?.[0] ? sel[0].getTime() : ""; },
      });
    });
  };
  initFp();

  const close = () => {
    // Tear flatpickr down on close so re-opening doesn't keep the old picked dates.
    ["bulk-release", "bulk-due"].forEach(id => {
      const el = document.getElementById(id);
      if (el && el._flatpickr) el._flatpickr.destroy();
    });
    hide("modal-overlay");
    m.hidden = true;
  };

  document.getElementById("bulk-cancel").addEventListener("click", close);

  document.getElementById("bulk-reset-responses")?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: `Reset every response in "${slug}"?`,
      message: `This wipes all recorded answers (votes + submissions) and resets attempt counters for every activity in <code>${escapeHTML(slug)}</code>. Students will be able to answer again. <strong>Can't be undone.</strong>`,
      confirmLabel: "Reset all", danger: true,
    });
    if (!confirmed) return;
    try {
      const r = await api.resetCategoryResponses(slug);
      const total = (r.votes || 0) + (r.submissions || 0);
      toast(`Wiped ${total} response${total === 1 ? "" : "s"} across ${r.activities} activit${r.activities === 1 ? "y" : "ies"}.`, "success");
      close();
      loadActivities();
    } catch (err) { setStatus("bulk-err", err.message, "error"); }
  });

  // Read either flatpickr's stashed epoch OR fall back to parsing the
  // input value directly. This unblocks people who type a date manually
  // or paste one in.
  function readEpoch(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.dataset.epochMs) return parseInt(el.dataset.epochMs, 10);
    if (el.value) {
      const t = new Date(el.value).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }

  function readStatusChoice() {
    const r = m.querySelector('input[name="bulk-status"]:checked');
    return r ? r.value : "keep";
  }

  // Tell the user exactly what students will see based on
  // their status + release combination. The most common
  // footgun is "open + future release" → still invisible.
  function refreshHint() {
    const rel = readEpoch("bulk-release");
    const status = readStatusChoice();
    const hint = document.getElementById("bulk-visibility-hint");
    const now = Date.now();
    let msg = "";
    if (status === "open" && rel != null && rel > now) {
      const when = new Date(rel).toLocaleString();
      msg = `Students see these starting <strong>${escapeHTML(when)}</strong>.`;
    } else if (status === "open" && (rel == null || rel <= now)) {
      msg = "Students see these <strong>immediately</strong> after Apply.";
    } else if (status === "closed") {
      msg = "Students <strong>won't see</strong> these regardless of date.";
    } else if (rel != null && rel > now) {
      msg = "Dates set, but status untouched — already-open ones will gate to the release date; closed ones stay hidden.";
    }
    hint.innerHTML = msg;
  }
  // Re-evaluate on every relevant input change.
  m.querySelectorAll('input[name="bulk-status"]').forEach(r => r.addEventListener("change", refreshHint));
  ["bulk-release", "bulk-due"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("change", refreshHint); el.addEventListener("input", refreshHint); }
  });
  refreshHint();

  document.getElementById("bulk-clear").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Clear both dates?",
      message: `Remove the release-at and due-at on every activity in <code>${escapeHTML(slug)}</code>?`,
      confirmLabel: "Clear", danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.bulkUpdateCategory(slug, { release_at: null, due_at: null });
      toast(`Cleared dates on ${r.updated} activit${r.updated === 1 ? "y" : "ies"}.`, "success");
      close();
      loadActivities();
    } catch (err) { setStatus("bulk-err", err.message, "error"); }
  });

  document.getElementById("bulk-apply").addEventListener("click", async () => {
    const rel = readEpoch("bulk-release");
    const due = readEpoch("bulk-due");
    const status = readStatusChoice();
    const payload = {};
    if (rel != null) payload.release_at = rel;
    if (due != null) payload.due_at = due;
    if (status === "open" || status === "closed") payload.status = status;

    // Max attempts: the bulk picker's first chip is "Leave alone" with
    // value="leave", which means don't include max_attempts on the wire.
    // Any numeric value (including 0 for unlimited) is an explicit choice.
    const bulkPicker = document.getElementById("bulk-attempts-picker-host")?.querySelector(".attempts-picker");
    const bulkV = bulkPicker?.dataset.value;
    if (bulkV != null && bulkV !== "leave") {
      const n = parseInt(bulkV, 10);
      if (Number.isFinite(n)) payload.max_attempts = n <= 0 ? null : n;
    }
    if (!Object.keys(payload).length) {
      setStatus("bulk-err", "Nothing to apply — pick a date, change the status, or set Max attempts to something other than \"Leave alone\".", "error");
      return;
    }
    try {
      const r = await api.bulkUpdateCategory(slug, payload);
      const bits = [];
      if (status === "open" || status === "closed") bits.push(`set to ${status}`);
      if (rel != null || due != null) bits.push("rescheduled");
      if (payload.max_attempts !== undefined) {
        bits.push(payload.max_attempts == null ? "set to unlimited attempts" : `capped at ${payload.max_attempts} attempt${payload.max_attempts === 1 ? "" : "s"}`);
      }
      const label = bits.length ? bits.join(" + ") : "updated";
      toast(`${r.updated} activit${r.updated === 1 ? "y" : "ies"} ${label}.`, "success");
      close();
      loadActivities();
    } catch (err) { setStatus("bulk-err", err.message, "error"); }
  });
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
    toast(err.message, "error");
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

  // Render the prompt as Markdown so long-form Markdown prompts wrap
  // cleanly and render code/bold/list/etc. — fallback to escaped text
  // until marked + DOMPurify finish loading.
  const titleEl = $("live-results-title");
  titleEl.classList.add("prompt-md");
  if (window.marked && window.DOMPurify) {
    titleEl.innerHTML = window.DOMPurify.sanitize(window.marked.parse(a.prompt || ""));
  } else {
    titleEl.textContent = a.prompt;
  }
  $("live-results-count").textContent = "";

  const liveBadge = $("live-badge");
  liveBadge.style.display = a.status === "open" ? "" : "none";

  // Clear previous content
  $("live-chart-container").innerHTML = "";
  hide("word-cloud-container");
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
    if (a.type === "poll" || a.type === "poll_pie" || a.type === "poll_multi") {
      await renderPollChart(a);
    } else if (a.type === "word_cloud") {
      await renderWordCloud(a);
    } else {
      // ordering + submission both fall through to the submissions table
      // (each row shows the student's posted answer).
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
    // Mirror the emails into the "Assign to one student" datalists used
    // by the new-activity form and the edit-activity modal. This gives
    // free autocomplete with zero extra fetches.
    const opts = (res.allowlist || []).map(r => `<option value="${escapeHTML(r.email)}">`).join("");
    const dl1 = $("assign-to-email-list");
    if (dl1) dl1.innerHTML = opts;
    const dl2 = $("edit-assign-to-email-list");
    if (dl2) dl2.innerHTML = opts;
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
        const ok = await confirmDialog({
          title: "Remove from allowlist?",
          message: `Revoke access for <strong>${escapeHTML(row.email)}</strong>?`,
          confirmLabel: "Remove",
          danger: true,
        });
        if (!ok) return;
        try { await api.removeAllowlist(row.email); loadAllowlist(); }
        catch (err) { toast(err.message, "error"); }
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
        const ok = await confirmDialog({
          title: "Remove instructor?",
          message: `Revoke instructor / superadmin access for <strong>${escapeHTML(row.email)}</strong>?`,
          confirmLabel: "Remove",
          danger: true,
        });
        if (!ok) return;
        try { await api.removeInstructor(row.email); loadInstructors(); }
        catch (err) { toast(err.message, "error"); }
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

// "Reset all responses" in the edit-modal's danger zone. Confirms first,
// then wipes votes + submissions + attempts via the dedicated endpoint.
$("edit-reset-responses")?.addEventListener("click", async () => {
  const id = $("edit-activity-id").value;
  if (!id) return;
  const ok = await confirmDialog({
    title: "Reset responses?",
    message: "This wipes every recorded answer and resets the attempt counter for this activity. Students will be able to answer again. <strong>Can't be undone.</strong>",
    confirmLabel: "Reset responses",
    danger: true,
  });
  if (!ok) return;
  try {
    const r = await api.resetActivityResponses(id);
    const total = (r.votes || 0) + (r.submissions || 0);
    toast(`Cleared ${total} response${total === 1 ? "" : "s"} and ${r.attempts || 0} attempt counter${r.attempts === 1 ? "" : "s"}.`, "success");
    loadActivities();
  } catch (err) {
    toast("Reset failed: " + err.message, "error");
  }
});

$("edit-activity-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("edit-activity-id").value;
  const type = $("edit-activity-type-val").value;
  const prompt = $("edit-activity-prompt").value.trim();
  const status = $("edit-activity-status-select").value;
  const sessionTag = $("edit-session-tag").value || null;

  const payload = { prompt, status, session_tag: sessionTag };

  // Read schedule fields — prefer Flatpickr's epochMs, fall back to
  // parsing input.value so manual edits work too. Explicit null lets us
  // CLEAR an existing date (server interprets null as "wipe").
  function readDate(id) {
    const el = $(id);
    if (!el) return undefined;
    if (el.dataset.epochMs) return parseInt(el.dataset.epochMs, 10);
    if (el.value) {
      const t = new Date(el.value).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return null; // input was cleared
  }
  payload.release_at = readDate("edit-release-at");
  payload.due_at = readDate("edit-due-at");

  payload.max_attempts = readAttemptsPicker(
    $("edit-max-attempts-picker")?.querySelector(".attempts-picker")
  );

  // Assignment: empty = clear (whole class), comma/newline-separated
  // list = pass through; server normalizes + validates each email.
  const assignRaw = ($("edit-assign-to-email")?.value || "").trim();
  payload.assigned_to_email = assignRaw || null;

  // Live-results visibility toggle.
  if ($("edit-show-results")) payload.show_results = $("edit-show-results").checked ? 1 : 0;

  // Options + correct-answer for poll-family + ordering.
  const optionTypes = new Set(["poll", "poll_pie", "poll_multi", "ordering"]);
  if (optionTypes.has(type)) {
    const options = getOptionValues("edit-poll-options-list");
    if (options.length < 2) {
      setStatus("edit-activity-status",
        type === "ordering" ? "Add at least 2 items to order" : "At least 2 options required",
        "error");
      return;
    }
    payload.poll_options = options;

    if (type === "poll" || type === "poll_pie") {
      const idxs = getCorrectIndices("edit-poll-options-list");
      if (idxs.length === 1) payload.correct_answer = { index: idxs[0] };
      else if (idxs.length > 1) {
        setStatus("edit-activity-status", "Single-choice polls allow at most one ✓.", "error");
        return;
      } else {
        payload.correct_answer = null; // ungrade
      }
    } else if (type === "poll_multi") {
      const idxs = getCorrectIndices("edit-poll-options-list");
      payload.correct_answer = idxs.length ? { indices: idxs } : null;
    }
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

// Live "Due in 3h 12m" / "Past due" chips on activity rows.
startDueCountdowns();

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
