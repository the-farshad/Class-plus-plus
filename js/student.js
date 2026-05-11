import { api, session } from "/js/api.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

function setStatus(targetId, msg, kind = "") {
  const el = $(targetId);
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function showActivity(a) {
  $("activity-id").value = a.activity_id;
  $("prompt-text").textContent = a.prompt;
  const typeTag = $("activity-type-tag");
  typeTag.textContent = a.type === "poll" ? "Interactive Poll" : "Written Submission";
  typeTag.className = "tag " + (a.type === "poll" ? "poll" : "open");

  hide("loading"); hide("picker"); hide("empty");
  
  if (a.type === "poll") {
    hide("submit-form");
    show("poll-card");
    renderPoll(a);
  } else {
    hide("poll-card");
    show("submit-form");
    show("form-card");
  }
}

function renderPoll(a) {
  const container = $("poll-options-list");
  container.innerHTML = "";
  const options = JSON.parse(a.poll_options || "[]");
  options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.style.textAlign = "left";
    btn.style.width = "100%";
    btn.textContent = opt;
    btn.addEventListener("click", async () => {
      setStatus("poll-status", "Voting…");
      try {
        await api.vote(a.activity_id, idx);
        setStatus("poll-status", "Vote recorded! Thanks.", "success");
        // Disable all buttons after voting
        container.querySelectorAll("button").forEach(b => b.disabled = true);
      } catch (err) {
        setStatus("poll-status", err.message, "error");
      }
    });
    container.appendChild(btn);
  });
  show("form-card");
}

function showPicker(activities) {
  hide("loading"); hide("form-card"); hide("empty");
  const list = $("picker-list");
  list.innerHTML = "";
  activities.forEach((a) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.innerHTML = `<strong>[${a.type.toUpperCase()}]</strong> ${a.prompt}`;
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
    $("domain-hint").textContent = `@${cfg.allowed_domain}`;
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
          hide("signin-card");
          await showSignedInState();
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
    await api.submit({
      activity_id: $("activity-id").value,
      response: $("response").value.trim(),
      file,
    });
    setStatus("status", "Submitted. Thanks!", "success");
  } catch (err) {
    setStatus("status", err.message, "error");
    btn.disabled = false;
  }
});

if (session.token) showSignedInState();
else showSignInState();
