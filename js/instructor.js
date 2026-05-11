import { api, session, API_BASE_URL } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

let activitiesCache = [];
let currentSubmissions = [];
let currentActivityId = null;
let classesCache = [];
let currentClassId = null;

function setStatus(targetId, msg, kind = "") {
  const el = $(targetId);
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
    const hint = document.getElementById("domain-hint");
    if (hint) hint.textContent = `@${cfg.allowed_domain}`;
    renderGoogleButton(cfg.google_client_id);
  } catch (err) {
    setStatus("signin-status", `Couldn't reach server: ${err.message}`, "error");
  }
}

function renderGoogleButton(clientId) {
  const tryRender = () => {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      setTimeout(tryRender, 200);
      return;
    }
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
      theme: "filled_blue",
      size: "large",
      shape: "pill",
      text: "signin_with",
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
async function loadStats() {
  try {
    const res = await api.getStats();
    $("stat-students").textContent = res.stats.students;
    $("stat-activities").textContent = res.stats.activities;
    
    // Placeholder chart data
    const ctx = document.getElementById('participation-chart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [{
          label: 'Submissions',
          data: [12, 19, 3, 5, 2],
          backgroundColor: 'rgba(79, 70, 229, 0.5)',
          borderColor: 'rgba(79, 70, 229, 1)',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } }
      }
    });
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

$("refresh-stats").addEventListener("click", loadStats);

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

$("signout").addEventListener("click", (e) => {
  e.preventDefault();
  api.signOut();
  location.reload();
});
$("forbidden-signout").addEventListener("click", () => {
  api.signOut();
  location.reload();
});

// ---------- Classes ----------

async function loadClasses() {
  try {
    const res = await api.listClasses();
    classesCache = res.classes;
    renderClassSelector();
    renderClassList();
  } catch (err) {
    console.error("Failed to load classes", err);
  }
}

function renderClassSelector() {
  const sel = $("class-selector");
  const val = sel.value;
  sel.innerHTML = '<option value="">Global / No class</option>';
  classesCache.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.code || ""} ${c.name}`.trim();
    sel.appendChild(opt);
  });
  sel.value = val;
}

$("class-selector").addEventListener("change", (e) => {
  currentClassId = e.target.value || null;
  loadActivities();
});

$("manage-classes-btn").addEventListener("click", () => show("class-management"));
$("close-class-mgmt").addEventListener("click", () => hide("class-management"));

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

    const delBtn = document.createElement("button");
    delBtn.className = "secondary sm";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete class and all its data?")) return;
      await api.deleteClass(c.id);
      loadClasses();
    });
    
    actions.append(rosterBtn, delBtn);
    li.append(info, actions);
    list.appendChild(li);
  });
}

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
  if (e.target.value === "poll") show("poll-options-container");
  else hide("poll-options-container");
});

$("refresh").addEventListener("click", loadActivities);

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("prompt").value.trim();
  const type = $("activity-type").value;
  let options = [];
  if (type === "poll") {
    options = $("poll-options").value.split(",").map(s => s.trim()).filter(Boolean);
    if (options.length < 2) {
      setStatus("new-status", "Poll needs at least 2 options", "error");
      return;
    }
  }

  if (!prompt) return;
  setStatus("new-status", "Creating…");
  try {
    const res = await api.createActivity(prompt, currentClassId, type, options);
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
    renderActivities();
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

function renderActivities() {
  const list = $("activities");
  list.innerHTML = "";
  if (!activitiesCache.length) {
    list.innerHTML = `<li class="muted">No activities for this class.</li>`;
    return;
  }
  activitiesCache.forEach((a) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const promptEl = document.createElement("div");
    promptEl.innerHTML = `<strong>[${a.type.toUpperCase()}]</strong> ${escapeHTML(a.prompt)}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const created = a.created_at
      ? new Date(a.created_at).toLocaleString()
      : "";
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
    view.textContent = a.type === "poll" ? "Results" : "Responses";
    view.addEventListener("click", () => a.type === "poll" ? showPollResults(a) : loadSubmissions(a));

    const linkBtn = document.createElement("button");
    linkBtn.className = "secondary sm";
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
    await api.setActivityStatus(a.activity_id, next);
    loadActivities();
  } catch (err) {
    alert(err.message);
  }
}

async function showPollResults(a) {
  currentActivityId = a.activity_id;
  $("submissions-card").hidden = false;
  $("submissions-title").textContent = `Poll Results — ${a.prompt}`;
  const tbody = $("submissions-table").querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;
  try {
    const res = await api.getResults(a.activity_id);
    tbody.innerHTML = "";
    res.options.forEach((opt, idx) => {
      const voteCount = res.votes.find(v => v.option_index === idx)?.count || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td colspan="2"><strong>${escapeHTML(opt)}</strong></td>
        <td>${voteCount} votes</td>
        <td>${res.votes.length ? Math.round((voteCount / res.votes.reduce((acc,v) => acc + v.count, 0)) * 100) : 0}%</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

// ---------- Submissions ----------

async function loadSubmissions(a) {
  currentActivityId = a.activity_id;
  $("submissions-card").hidden = false;
  $("submissions-title").textContent = `Submissions — ${a.prompt}`;
  const tbody = $("submissions-table").querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;
  try {
    const res = await api.listSubmissions(a.activity_id);
    currentSubmissions = res.submissions;
    tbody.innerHTML = "";
    if (!currentSubmissions.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No submissions yet.</td></tr>`;
      return;
    }
    currentSubmissions.forEach((s) => {
      const tr = document.createElement("tr");
      const when = new Date(s.created_at).toLocaleString();
      tr.innerHTML = `
        <td>${escapeHTML(when)}</td>
        <td>${escapeHTML(s.email)}${s.student_id ? `<br><span class="muted">${escapeHTML(s.student_id)}</span>` : ""}</td>
        <td>${escapeHTML(s.response)}</td>
        <td>${attachmentCell(s)}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function attachmentCell(s) {
  if (s.drive_url) {
    return `<a href="${escapeHTML(s.drive_url)}" target="_blank" rel="noopener">View on Drive ↗</a>`;
  }
  if (s.attachment_local) {
    const url = `${API_BASE_URL}/uploads/${encodeURIComponent(s.attachment_local)}`;
    if ((s.attachment_mime || "").startsWith("image/")) {
      return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener"><img src="${escapeHTML(url)}" alt="" style="max-height:64px; border-radius:6px;"></a>`;
    }
    return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">Download</a>`;
  }
  return `<span class="muted">—</span>`;
}

$("export-csv").addEventListener("click", () => {
  if (!currentSubmissions.length) return;
  const rows = [["timestamp", "email", "student_id", "response", "attachment"]];
  currentSubmissions.forEach((s) => {
    const attachment = s.drive_url
      || (s.attachment_local ? `${API_BASE_URL}/uploads/${s.attachment_local}` : "");
    rows.push([
      new Date(s.created_at).toISOString(),
      s.email, s.student_id || "", s.response, attachment,
    ]);
  });
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
    if (!res.allowlist.length) {
      list.innerHTML = `<li class="muted">Empty.</li>`;
      return;
    }
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
        try {
          await api.removeAllowlist(row.email);
          loadAllowlist();
        } catch (err) {
          alert(err.message);
        }
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
    if (!res.instructors.length) {
      list.innerHTML = `<li class="muted">Empty.</li>`;
      return;
    }
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
        try {
          await api.removeInstructor(row.email);
          loadInstructors();
        } catch (err) {
          alert(err.message);
        }
      });

      li.append(left, remove);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Boot ----------

if (session.token) enterDashboard();
else showSignIn();
emoveInstructor(row.email);
          loadInstructors();
        } catch (err) {
          alert(err.message);
        }
      });

      li.append(left, remove);
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="muted">Error: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Boot ----------

if (session.token) enterDashboard();
else showSignIn();
