import { api, session, API_BASE_URL } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

let activitiesCache = [];
let currentSubmissions = [];
let currentActivityId = null;

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
  if (u.role !== "instructor") {
    hide("signin-card"); hide("dashboard");
    show("forbidden-card");
    return;
  }
  hide("signin-card"); hide("forbidden-card");
  show("dashboard");
  $("who-am-i").textContent = `Signed in as ${u.email}`;
  $("signout").hidden = false;
  loadActivities();
  loadAllowlist();
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

// ---------- Activities ----------

$("refresh").addEventListener("click", loadActivities);

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("prompt").value.trim();
  if (!prompt) return;
  setStatus("new-status", "Creating…");
  try {
    const res = await api.createActivity(prompt);
    setStatus("new-status", `Created (#${res.activity_id})`, "success");
    $("prompt").value = "";
    loadActivities();
  } catch (err) {
    setStatus("new-status", err.message, "error");
  }
});

async function loadActivities() {
  const list = $("activities");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const res = await api.listAllActivities();
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
    view.textContent = "Responses";
    view.addEventListener("click", () => loadSubmissions(a));

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

// ---------- Boot ----------

if (session.token) enterDashboard();
else showSignIn();
