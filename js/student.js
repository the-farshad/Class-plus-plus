import { api, session } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.hidden = false; };
const hide = (id) => { const el = $(id); if (el) el.hidden = true; };

function setStatusEl(id, msg, kind = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

const TYPE_ICONS = {
  poll: "📊", poll_pie: "🥧", rating: "⭐", word_cloud: "☁️", submission: "📝",
};
const TYPE_LABELS = {
  poll: "Poll", poll_pie: "Poll", rating: "Rating", word_cloud: "Word Cloud", submission: "Submission",
};

// ---- Auto-refresh for empty state ----
let countdownTimer = null;
let countdownSec = 20;

function startCountdown() {
  countdownSec = 20;
  updateCountdown();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(async () => {
    countdownSec--;
    updateCountdown();
    if (countdownSec <= 0) {
      clearInterval(countdownTimer);
      await loadActivities();
    }
  }, 1000);
}

function updateCountdown() {
  const el = $("countdown-num");
  if (el) el.textContent = countdownSec;
}

function stopCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
}

// ---- Activity display ----

function showActivity(a) {
  stopCountdown();
  $("activity-id").value = a.activity_id;

  // Header in form-card
  const heading = document.createElement("div");
  heading.style.marginBottom = "1.25rem";
  heading.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
      <div style="flex:1;">
        <h2 id="prompt-text" style="margin:0;font-size:1.4rem;line-height:1.3;">${escapeHTML(a.prompt)}</h2>
      </div>
      <span class="tag poll" id="activity-type-tag">${TYPE_ICONS[a.type] || ""} ${TYPE_LABELS[a.type] || a.type}</span>
    </div>`;

  const fc = $("form-card");
  // Remove previous heading if any
  const prev = fc.querySelector(".activity-heading");
  if (prev) prev.remove();
  heading.className = "activity-heading";
  fc.insertBefore(heading, fc.firstChild);

  hide("loading"); hide("picker"); hide("empty"); hide("confirm-card");
  hide("poll-card"); hide("rating-card"); hide("rating-form"); hide("submit-form");

  if (a.type === "poll" || a.type === "poll_pie") {
    show("poll-card");
    renderPoll(a);
  } else if (a.type === "rating") {
    show("rating-form");
    renderRating(a);
  } else {
    const lbl = $("response-label");
    if (lbl) lbl.textContent = a.type === "word_cloud" ? "Your answer (1–3 words)" : "Your Response";
    const ta = $("response");
    if (ta) ta.placeholder = a.type === "word_cloud"
      ? "e.g. algorithms, OOP, job skills"
      : "Type your answer here…";
    show("submit-form");
  }

  show("form-card");
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderPoll(a) {
  const container = $("poll-options-list");
  container.innerHTML = "";
  const options = JSON.parse(a.poll_options || "[]");
  const letters = "ABCDEFGHIJKLMNOP";

  options.forEach((opt, idx) => {
    const tile = document.createElement("button");
    tile.className = "poll-tile";
    tile.type = "button";
    tile.innerHTML = `<span class="poll-tile-letter">${letters[idx] || idx + 1}</span><span class="poll-tile-text">${escapeHTML(opt)}</span>`;

    tile.addEventListener("click", async () => {
      setStatusEl("poll-status", "Recording your vote…");
      container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
      try {
        await api.vote(a.activity_id, idx);
        tile.classList.add("selected");
        setStatusEl("poll-status", "Vote recorded — thanks!", "success");
      } catch (err) {
        container.querySelectorAll(".poll-tile").forEach(b => b.disabled = false);
        setStatusEl("poll-status", err.message, "error");
      }
    });

    container.appendChild(tile);
  });
}

function renderRating(a) {
  const container = $("rating-buttons");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rating-btn";
    btn.textContent = i;
    btn.dataset.value = i;
    btn.addEventListener("click", () => {
      container.querySelectorAll(".rating-btn").forEach(b => {
        b.classList.toggle("selected", Number(b.dataset.value) <= i);
      });
      $("rating-hidden").value = i;
    });
    container.appendChild(btn);
  }

  const labels = $("rating-labels");
  if (labels) labels.innerHTML = "<span>Beginner</span><span>Expert</span>";
}

function showPicker(activities) {
  hide("loading"); hide("form-card"); hide("empty");
  const grid = $("picker-list");
  grid.innerHTML = "";
  activities.forEach(a => {
    const card = document.createElement("button");
    card.className = "picker-card";
    card.type = "button";
    card.innerHTML = `
      <div class="picker-card-icon">${TYPE_ICONS[a.type] || "📋"}</div>
      <div class="picker-card-title">${escapeHTML(a.prompt)}</div>
      <div class="picker-card-type">${TYPE_LABELS[a.type] || a.type}</div>`;
    card.addEventListener("click", () => showActivity(a));
    grid.appendChild(card);
  });
  show("picker");
}

async function loadActivities() {
  show("loading");
  hide("picker"); hide("form-card"); hide("empty");

  try {
    const params = new URLSearchParams(location.search);
    const id = params.get("activity");
    const classId = params.get("class");

    if (id) {
      const res = await api.getActivity(id);
      hide("loading");
      showActivity(res.activity);
      return;
    }

    const res = await api.listOpenActivities(classId);
    hide("loading");

    if (!res.activities.length) {
      show("empty");
      startCountdown();
      return;
    }
    if (res.activities.length === 1) {
      showActivity(res.activities[0]);
    } else {
      showPicker(res.activities);
    }
  } catch (err) {
    hide("loading");
    const card = $("empty");
    card.querySelector("h2").textContent = "Couldn't connect";
    card.querySelector("p").textContent = err.message;
    show("empty");
    startCountdown();
  }
}

async function showSignedInState() {
  const u = session.user;
  if (!u) return;

  // Show session banner
  const metaEl = $("hero-meta");
  const whoEl = $("who-am-i");
  if (whoEl) whoEl.textContent = u.email;
  if (metaEl) metaEl.hidden = false;

  if (u.role === "instructor" || u.role === "superadmin") {
    show("nav-admin");
  }
  await loadActivities();
}

async function showSignInState() {
  hide("loading"); hide("picker"); hide("form-card"); hide("empty");
  show("signin-card");
  try {
    const cfg = await api.authConfig();
    const hint = $("domain-hint");
    if (hint) hint.textContent = `@${cfg.allowed_domain}`;
    renderGoogleButton(cfg.google_client_id);
  } catch (err) {
    setStatusEl("signin-status", `Couldn't reach server: ${err.message}`, "error");
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
          hide("signin-card");
          await showSignedInState();
        } catch (err) {
          setStatusEl("signin-status", err.message, "error");
        }
      },
    });
    window.google.accounts.id.renderButton($("g_id_signin"), {
      theme: "filled_blue", size: "large", shape: "pill", text: "signin_with",
    });
  };
  tryRender();
}

$("signout").addEventListener("click", e => {
  e.preventDefault();
  api.signOut();
  location.reload();
});

$("rating-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = $("rating-hidden").value;
  if (!val) { setStatusEl("rating-status", "Please select a rating.", "error"); return; }
  const btn = $("rating-submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("rating-status", "Submitting…");
  try {
    await api.submit({ activity_id: $("activity-id").value, response: val });
    // Show confirmation
    hide("rating-form");
    show("confirm-card");
    $("rating-hidden").value = "";
  } catch (err) {
    setStatusEl("rating-status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("status", "Submitting…");
  try {
    const file = $("file").files[0] || null;
    await api.submit({
      activity_id: $("activity-id").value,
      response: $("response").value.trim(),
      file,
    });
    // Show confirmation
    hide("submit-form");
    show("confirm-card");
    $("response").value = "";
  } catch (err) {
    setStatusEl("status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

if (session.token) showSignedInState();
else showSignInState();
