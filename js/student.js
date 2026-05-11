import { api, session } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.hidden = false; };
const hide = (id) => { const el = $(id); if (el) el.hidden = true; };

function setStatus(targetId, msg, kind = "") {
  const el = $(targetId);
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function showActivity(a) {
  $("activity-id").value = a.activity_id;
  $("prompt-text").textContent = a.prompt;

  const typeTag = $("activity-type-tag");
  const labelMap = {
    poll: "📊 Poll",
    poll_pie: "🥧 Poll",
    rating: "⭐ Rating",
    word_cloud: "☁️ Word Cloud",
    submission: "📝 Submission",
  };
  typeTag.textContent = labelMap[a.type] || a.type;
  typeTag.className = "tag " + (a.type === "poll" || a.type === "poll_pie" ? "poll" : "open");

  hide("loading"); hide("picker"); hide("empty");
  hide("poll-card"); hide("rating-card"); hide("submit-form");

  if (a.type === "poll" || a.type === "poll_pie") {
    show("poll-card");
    renderPoll(a);
  } else if (a.type === "rating") {
    show("rating-card");
    renderRating(a);
  } else {
    // submission or word_cloud — both use the text form
    const label = $("response-label");
    if (label) label.textContent = a.type === "word_cloud" ? "Your answer (1–3 words)" : "Your Response";
    const placeholder = $("response");
    if (placeholder) placeholder.placeholder = a.type === "word_cloud"
      ? "e.g. algorithms, OOP, job skills"
      : "Type your answer here...";
    show("submit-form");
  }

  show("form-card");
}

// Poll as large clickable tiles (Mentimeter-style)
function renderPoll(a) {
  const container = $("poll-options-list");
  container.innerHTML = "";
  const options = JSON.parse(a.poll_options || "[]");
  const letters = "ABCDEFGHIJKLMNOP";

  options.forEach((opt, idx) => {
    const tile = document.createElement("button");
    tile.className = "poll-tile";
    tile.type = "button";
    tile.innerHTML = `<span class="poll-tile-letter">${letters[idx] || idx + 1}</span><span class="poll-tile-text">${opt}</span>`;

    tile.addEventListener("click", async () => {
      setStatus("poll-status", "Voting…");
      container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
      try {
        await api.vote(a.activity_id, idx);
        tile.classList.add("selected");
        setStatus("poll-status", "Vote recorded! Thanks.", "success");
      } catch (err) {
        container.querySelectorAll(".poll-tile").forEach(b => b.disabled = false);
        setStatus("poll-status", err.message, "error");
      }
    });

    container.appendChild(tile);
  });
}

// Rating as a 1–10 scale (Slido/Mentimeter scale question)
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

    btn.addEventListener("click", async () => {
      container.querySelectorAll(".rating-btn").forEach(b => {
        b.classList.toggle("selected", Number(b.dataset.value) <= i);
      });
      $("rating-hidden").value = i;
    });

    container.appendChild(btn);
  }

  $("rating-labels").innerHTML =
    `<span class="muted">Beginner</span><span class="muted">Expert</span>`;
}

$("rating-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = $("rating-hidden").value;
  if (!val) { setStatus("rating-status", "Please select a value.", "error"); return; }
  const btn = e.submitter || e.target.querySelector("button[type=submit]");
  if (btn) btn.disabled = true;
  setStatus("rating-status", "Submitting…");
  try {
    await api.submit({ activity_id: $("activity-id").value, response: val });
    setStatus("rating-status", `You rated ${val}/10 — thanks!`, "success");
    $("rating-buttons").querySelectorAll(".rating-btn").forEach(b => b.disabled = true);
  } catch (err) {
    setStatus("rating-status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

function showPicker(activities) {
  hide("loading"); hide("form-card"); hide("empty");
  const list = $("picker-list");
  list.innerHTML = "";
  const labelMap = { poll: "📊 Poll", poll_pie: "🥧 Poll", rating: "⭐ Rating", word_cloud: "☁️ Word Cloud", submission: "📝" };
  activities.forEach((a) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    const label = labelMap[a.type] || a.type.toUpperCase();
    span.innerHTML = `<strong>[${label}]</strong> ${a.prompt}`;
    const btn = document.createElement("button");
    btn.className = "sm";
    btn.textContent = "Choose →";
    btn.addEventListener("click", () => showActivity(a));
    li.append(span, btn);
    list.appendChild(li);
  });
  show("picker");
}

async function loadActivities() {
  show("loading");
  hide("signin-card"); hide("picker"); hide("form-card"); hide("empty");
  try {
    const params = new URLSearchParams(location.search);
    const id = params.get("activity");
    const classId = params.get("class");

    if (id) {
      const res = await api.getActivity(id);
      showActivity(res.activity);
      return;
    }
    const res = await api.listOpenActivities(classId);
    if (!res.activities.length) { hide("loading"); show("empty"); return; }
    if (res.activities.length === 1) showActivity(res.activities[0]);
    else showPicker(res.activities);
  } catch (err) {
    hide("loading");
    const card = $("empty");
    card.querySelector("h2").textContent = "Couldn't load activities";
    card.querySelector("p").textContent = err.message;
    show("empty");
  }
}

async function showSignedInState() {
  const u = session.user;
  if (!u) return;
  $("who-am-i").textContent = `Signed in as ${u.email}`;
  $("signout").hidden = false;
  if (u.role === "instructor" || u.role === "superadmin") show("nav-admin");
  await loadActivities();
}

async function showSignInState() {
  hide("loading"); hide("picker"); hide("form-card"); hide("empty");
  show("signin-card");
  try {
    const cfg = await api.authConfig();
    $("domain-hint").textContent = `@${cfg.allowed_domain}`;
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
          hide("signin-card");
          await showSignedInState();
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

$("signout").addEventListener("click", (e) => {
  e.preventDefault();
  api.signOut();
  location.reload();
});

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("submit-btn");
  btn.disabled = true;
  setStatus("status", "Submitting…");
  try {
    const file = $("file").files[0] || null;
    await api.submit({ activity_id: $("activity-id").value, response: $("response").value.trim(), file });
    setStatus("status", "Submitted. Thanks!", "success");
  } catch (err) {
    setStatus("status", err.message, "error");
    btn.disabled = false;
  }
});

if (session.token) showSignedInState();
else showSignInState();
