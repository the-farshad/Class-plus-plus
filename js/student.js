import { api, session, API_BASE_URL } from "/js/api.js";
import {
  $, show, hide, escapeHTML, setStatus as setStatusEl,
  mountSettingsDrawer, updateUserPill, setupMicrosoftSignIn,
} from "/js/ui.js";

const TYPE_LABELS = {
  poll: "Poll", poll_pie: "Poll", rating: "Rating",
  word_cloud: "Word Cloud", submission: "Submission", ordering: "Order",
};

// ---- SSE live updates ----
let sseSource = null;
let sseRetryTimer = null;
let fallbackTimer = null;

function connectSSE() {
  if (sseSource) return; // already connected
  sseSource = new EventSource(`${API_BASE_URL}/activities/events`);

  sseSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "activities_changed") loadActivities();
    } catch { /* ignore parse errors */ }
  };

  sseSource.addEventListener("error", () => {
    sseSource.close();
    sseSource = null;
    // Retry SSE after 5 s; while waiting, fall back to a single 5 s poll
    clearTimeout(sseRetryTimer);
    sseRetryTimer = setTimeout(connectSSE, 5000);
    // Fallback poll if no server push arrives
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(loadActivities, 5000);
  });
}

function disconnectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  clearTimeout(sseRetryTimer);
  clearTimeout(fallbackTimer);
}

// Kept for error-state display only (no longer used for refresh)
function stopCountdown() { /* noop — SSE handles refresh now */ }

// ---- Activity display ----

function showActivity(a) {
  stopCountdown();
  stopResultsRefresh();
  // Remove any stale results panel from a previous activity.
  const oldResults = document.getElementById("student-results");
  if (oldResults) oldResults.remove();
  $("activity-id").value = a.activity_id;

  // Header in form-card — render the prompt as sanitized Markdown so
  // instructors can author with code fences, **bold**, lists, etc.
  const heading = document.createElement("div");
  heading.style.marginBottom = "1.25rem";
  heading.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
      <div class="prompt-md" style="flex:1;font-size:1.05rem;line-height:1.55;"></div>
      <span class="tag poll" id="activity-type-tag" style="flex-shrink:0;">${TYPE_LABELS[a.type] || a.type}</span>
    </div>`;
  // Render prompt: marked → DOMPurify. Falls back to plain escaped text
  // until both libraries finish loading.
  const promptEl = heading.querySelector(".prompt-md");
  const renderPrompt = () => {
    const rawHTML = window.marked ? window.marked.parse(a.prompt || "") : `<p>${escapeHTML(a.prompt)}</p>`;
    promptEl.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHTML) : rawHTML;
    if (window.Prism) {
      promptEl.querySelectorAll("pre code").forEach(b => {
        if (!b.className) b.className = "language-cpp";
        window.Prism.highlightElement(b);
      });
    }
  };
  if (window.marked) renderPrompt();
  else window.addEventListener("load", renderPrompt, { once: true });

  const fc = $("form-card");
  // Remove previous heading if any
  const prev = fc.querySelector(".activity-heading");
  if (prev) prev.remove();
  heading.className = "activity-heading";
  fc.insertBefore(heading, fc.firstChild);

  hide("loading"); hide("picker"); hide("empty"); hide("confirm-card");
  hide("poll-card"); hide("rating-card"); hide("rating-form"); hide("submit-form"); hide("order-form");

  // If the user has already submitted/voted on this activity, jump straight
  // to the confirmation panel instead of re-showing the form.
  const alreadyVoted = (a.type === "poll" || a.type === "poll_pie") && localStorage.getItem(VOTE_KEY(a.activity_id)) !== null;
  const alreadySubmitted = (a.type !== "poll" && a.type !== "poll_pie") && localStorage.getItem(SUBMIT_KEY(a.activity_id));
  void alreadyVoted; // suppress lint — read below for poll branch

  if (a.type === "poll" || a.type === "poll_pie") {
    show("poll-card");
    renderPoll(a);
  } else if (a.type === "ordering") {
    if (alreadySubmitted) {
      show("confirm-card");
      show("form-card");
      return;
    }
    show("order-form");
    renderOrdering(a);
  } else if (a.type === "rating") {
    if (alreadySubmitted) {
      show("confirm-card");
      show("form-card");
      return;
    }
    show("rating-form");
    renderRating(a);
  } else {
    if (alreadySubmitted) {
      show("confirm-card");
      show("form-card");
      return;
    }
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

// localStorage keys for client-side one-vote-per-user persistence.
// The server already enforces UNIQUE(activity_id, email), so this is purely UX:
// it stops the user from clicking other tiles after they've voted and
// remembers their choice across page reloads.
const VOTE_KEY = (id) => `classpp.voted.${id}`;
const SUBMIT_KEY = (id) => `classpp.submitted.${id}`;

function renderPoll(a) {
  const container = $("poll-options-list");
  container.innerHTML = "";
  const options = JSON.parse(a.poll_options || "[]");
  const letters = "ABCDEFGHIJKLMNOP";
  const priorVote = localStorage.getItem(VOTE_KEY(a.activity_id));

  options.forEach((opt, idx) => {
    const tile = document.createElement("button");
    tile.className = "poll-tile";
    tile.type = "button";
    tile.innerHTML = `<span class="poll-tile-letter">${letters[idx] || idx + 1}</span><span class="poll-tile-text">${escapeHTML(opt)}</span>`;

    if (priorVote !== null && String(idx) === priorVote) {
      tile.classList.add("selected");
    }

    tile.addEventListener("click", async () => {
      setStatusEl("poll-status", "Recording your vote…");
      container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
      try {
        await api.vote(a.activity_id, idx);
        container.querySelectorAll(".poll-tile").forEach(b => b.classList.remove("selected"));
        tile.classList.add("selected");
        localStorage.setItem(VOTE_KEY(a.activity_id), String(idx));
        setStatusEl("poll-status", "Vote recorded — live results below.", "success");
        showPollResults(a);
      } catch (err) {
        container.querySelectorAll(".poll-tile").forEach(b => b.disabled = false);
        setStatusEl("poll-status", err.message, "error");
      }
    });

    container.appendChild(tile);
  });

  if (priorVote !== null) {
    container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
    setStatusEl("poll-status", "You already voted — live results below.", "success");
    showPollResults(a);
  }
}

// ----- Student-side poll results (shown after voting) -----

let resultsRefreshTimer = null;

function stopResultsRefresh() {
  if (resultsRefreshTimer) { clearInterval(resultsRefreshTimer); resultsRefreshTimer = null; }
}

async function showPollResults(a) {
  let panel = document.getElementById("student-results");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "student-results";
    panel.className = "student-results";
    $("poll-card").appendChild(panel);
  }
  await refreshPollResults(a, panel);
  stopResultsRefresh();
  resultsRefreshTimer = setInterval(() => refreshPollResults(a, panel), 4000);
}

async function refreshPollResults(a, panel) {
  try {
    const res = await api.getResults(a.activity_id);
    const options = res.options || [];
    const myVote = localStorage.getItem(VOTE_KEY(a.activity_id));
    const total = res.votes.reduce((acc, v) => acc + v.count, 0);
    const counts = options.map((_, idx) => res.votes.find(v => v.option_index === idx)?.count || 0);
    const maxCount = Math.max(1, ...counts);
    const letters = "ABCDEFGHIJKLMNOP";

    const isPie = a.type === "poll_pie";
    panel.innerHTML = `
      <div class="results-head">
        <span class="results-title"><i data-lucide="bar-chart-3"></i> Live results</span>
        <span class="results-count">${total} vote${total !== 1 ? "s" : ""}</span>
      </div>
      <div class="results-bars">
        ${options.map((opt, idx) => {
          const c = counts[idx];
          const pct = total ? Math.round((c / total) * 100) : 0;
          const widthPct = Math.round((c / maxCount) * 100);
          const mine = myVote !== null && String(idx) === myVote;
          return `
            <div class="result-row${mine ? " mine" : ""}">
              <div class="result-row-head">
                <span class="result-letter">${letters[idx] || idx + 1}</span>
                <span class="result-label">${escapeHTML(opt)}</span>
                ${mine ? `<span class="result-mine-badge"><i data-lucide="check"></i> Your vote</span>` : ""}
                <span class="result-pct">${pct}%</span>
              </div>
              <div class="result-bar"><div class="result-bar-fill" style="width:${widthPct}%"></div></div>
              <div class="result-row-meta">${c} vote${c !== 1 ? "s" : ""}</div>
            </div>`;
        }).join("")}
      </div>
      ${isPie ? `<p class="muted" style="font-size:0.78rem;margin:0.5rem 0 0;text-align:center;">Showing as percentages — instructor sees a pie view.</p>` : ""}`;
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    panel.innerHTML = `<p class="muted" style="font-size:0.85rem;">Couldn't load results: ${escapeHTML(err.message)}</p>`;
  }
}

// Fisher-Yates shuffle that's seeded by the activity id + user email so a
// given student always gets the same shuffle for a given activity (avoids
// the "wait, where did my item go" jump if the page refreshes).
function shuffleStable(arr, seed) {
  const out = arr.slice();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 16807) + 1) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let orderSortable = null;
function renderOrdering(a) {
  const items = JSON.parse(a.poll_options || "[]");
  const seed = a.activity_id + "::" + ((session.user && session.user.email) || "anon");
  // shuffled is an array of { item, originalIndex }
  const shuffled = shuffleStable(items.map((item, idx) => ({ item, originalIndex: idx })), seed);

  const list = $("order-items");
  list.innerHTML = "";
  shuffled.forEach((entry, displayIdx) => {
    const li = document.createElement("li");
    li.className = "order-item";
    li.dataset.originalIndex = entry.originalIndex;
    li.innerHTML = `
      <span class="order-handle" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>
      <span class="order-num">${displayIdx + 1}</span>
      <span class="order-text">${escapeHTML(entry.item)}</span>`;
    list.appendChild(li);
  });
  if (window.lucide) window.lucide.createIcons();

  // Wire SortableJS (loaded via CDN). Update the visible numbers after every drop.
  if (orderSortable) { orderSortable.destroy(); orderSortable = null; }
  const wireSort = () => {
    if (!window.Sortable) { setTimeout(wireSort, 100); return; }
    orderSortable = window.Sortable.create(list, {
      animation: 160,
      handle: ".order-handle",
      ghostClass: "order-item-ghost",
      chosenClass: "order-item-chosen",
      onSort: () => {
        list.querySelectorAll(".order-item").forEach((el, i) => {
          el.querySelector(".order-num").textContent = String(i + 1);
        });
      },
    });
  };
  wireSort();
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
    const PICKER_ICON = { poll:"bar-chart-2", poll_pie:"pie-chart", rating:"star", word_cloud:"cloud", submission:"file-text" };
    card.innerHTML = `
      <div class="picker-card-icon"><i data-lucide="${PICKER_ICON[a.type]||"file-text"}" style="width:22px;height:22px;color:var(--brand);"></i></div>
      <div class="picker-card-title">${escapeHTML(a.prompt)}</div>
      <div class="picker-card-type">${TYPE_LABELS[a.type] || a.type}</div>`;
    card.addEventListener("click", () => showActivity(a));
    grid.appendChild(card);
  });
  show("picker");
  // CRITICAL: convert inert <i data-lucide> placeholders into real SVGs.
  // Without this the picker-card-icon containers render as empty squares.
  if (window.lucide) window.lucide.createIcons();
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
      // SSE will wake us when an activity opens — no countdown needed
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
    const isNetwork = err.message.includes("NetworkError") || err.message.includes("Failed to fetch") || err.message.includes("fetch");
    card.querySelector("h2").textContent = isNetwork ? "Can't reach the server" : "Something went wrong";
    card.querySelector("p").textContent = isNetwork
      ? "Check your connection — the server may be temporarily unavailable."
      : err.message;
    show("empty");
  }
}

async function showSignedInState() {
  const u = session.user;
  if (!u) return;

  hide("landing-hero");
  show("session-hero");

  updateUserPill(u);

  const metaEl = $("hero-meta");
  const whoEl = $("who-am-i");
  if (whoEl) whoEl.textContent = u.email;
  if (metaEl) metaEl.hidden = false;

  if (u.role === "instructor" || u.role === "superadmin") {
    show("nav-admin");
  }

  connectSSE(); // start live push before first load
  await loadActivities();
}

async function showSignInState() {
  hide("loading"); hide("picker"); hide("form-card"); hide("empty");
  hide("session-hero");
  show("landing-hero");
  show("signin-card");
  // Make sure the email/password label-floating works on autofilled values:
  // Chrome's autofill sometimes doesn't dispatch a focus event. Trigger it.
  setTimeout(() => $("pw-email")?.focus(), 50);

  // Wire the email + password form once. Idempotent.
  const form = $("password-form");
  if (form && !form.dataset.wired) {
    form.dataset.wired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("pw-email").value.trim().toLowerCase();
      const password = $("pw-password").value;
      const btn = $("pw-submit");
      btn.disabled = true;
      setStatusEl("signin-status", "Signing in…");
      try {
        await api.signInWithPassword(email, password);
        $("pw-password").value = "";
        hide("signin-card");
        await showSignedInState();
      } catch (err) {
        setStatusEl("signin-status", err.message || "Sign-in failed", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Render the Google button as a secondary option (for instructors /
  // guests with Google accounts). Pulls the client ID from /auth/config.
  try {
    const cfg = await api.authConfig();
    if (cfg.google_client_id) renderGoogleButton(cfg.google_client_id);
  } catch { /* offline — password form still works if the user has a cached session */ }
}

// Pick a Google button theme that visually matches the current site theme.
// outline = neutral light, filled_blue = brand-blue, filled_black = dark.
function pickGoogleTheme() {
  const t = document.documentElement.getAttribute("data-theme") || "light";
  // filled_black for dark themes; filled_blue (Google's recognizable blue
  // pill) for everything else — outline still renders with a white-ish
  // background, which clashes with non-white themes like sepia/uwyo.
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
          hide("signin-card");
          await showSignedInState();
        } catch (err) {
          setStatusEl("signin-status", err.message, "error");
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

$("rating-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = $("rating-hidden").value;
  if (!val) { setStatusEl("rating-status", "Please select a rating.", "error"); return; }
  const btn = $("rating-submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("rating-status", "Submitting…");
  try {
    const id = $("activity-id").value;
    await api.submit({ activity_id: id, response: val });
    localStorage.setItem(SUBMIT_KEY(id), "1");
    hide("rating-form");
    show("confirm-card");
    $("rating-hidden").value = "";
  } catch (err) {
    setStatusEl("rating-status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

$("order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const list = $("order-items");
  const order = [...list.querySelectorAll(".order-item")].map(el => el.dataset.originalIndex).join(",");
  const btn = $("order-submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("order-status", "Submitting your order…");
  try {
    const id = $("activity-id").value;
    await api.submit({ activity_id: id, response: order });
    localStorage.setItem(SUBMIT_KEY(id), "1");
    hide("order-form");
    show("confirm-card");
  } catch (err) {
    setStatusEl("order-status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("status", "Submitting…");
  try {
    const id = $("activity-id").value;
    const file = $("file").files[0] || null;
    await api.submit({
      activity_id: id,
      response: $("response").value.trim(),
      file,
    });
    localStorage.setItem(SUBMIT_KEY(id), "1");
    hide("submit-form");
    show("confirm-card");
    $("response").value = "";
  } catch (err) {
    setStatusEl("status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

mountSettingsDrawer({
  api,
  session,
  onSignOut: () => { disconnectSSE(); api.signOut(); location.reload(); },
});

if (session.token) showSignedInState();
else showSignInState();
