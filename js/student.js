import { api, session, API_BASE_URL } from "/js/api.js";
import {
  $, show, hide, escapeHTML, setStatus as setStatusEl,
  mountSettingsDrawer, updateUserPill, setupMicrosoftSignIn,
  toast,
} from "/js/ui.js";

const TYPE_LABELS = {
  poll: "Single choice", poll_pie: "Single choice", poll_multi: "Multiple choice",
  word_cloud: "Word Cloud", submission: "Submission", ordering: "Order",
};

// Render a Markdown string (untrusted source — sanitize) as HTML.
// Falls back to escaped text until marked + DOMPurify finish loading.
function md(text) {
  if (window.marked && window.DOMPurify) {
    return window.DOMPurify.sanitize(window.marked.parse(text || ""));
  }
  return `<p>${escapeHTML(text)}</p>`;
}
function mdInline(text) {
  if (window.marked && window.DOMPurify) {
    const m = window.marked;
    const html = m.parseInline ? m.parseInline(text || "") : m.parse(text || "");
    return window.DOMPurify.sanitize(html);
  }
  return escapeHTML(text);
}

// Flatten a Markdown prompt to a short, plain-text preview suitable
// for tight picker cards. Strips fenced code, inline code, links,
// emphasis markers, headings, list markers, and trims to `max` chars.
function previewText(src, max = 130) {
  let s = String(src || "");
  s = s.replace(/```[\s\S]*?```/g, " ");          // fenced code blocks
  s = s.replace(/`[^`]*`/g, " ");                  // inline code
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");     // images
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");   // links → link text
  s = s.replace(/^\s*#{1,6}\s+/gm, "");            // heading markers
  s = s.replace(/^\s*[-*+]\s+/gm, "");             // ul markers
  s = s.replace(/^\s*\d+\.\s+/gm, "");             // ol markers
  s = s.replace(/[*_~]+/g, "");                    // bold/italic/strike markers
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

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
  hide("poll-card"); hide("submit-form"); hide("order-form");

  // If the user has already submitted/voted on this activity, jump straight
  // to the confirmation panel instead of re-showing the form.
  const alreadyVoted = (a.type === "poll" || a.type === "poll_pie") && localStorage.getItem(VOTE_KEY(a.activity_id)) !== null;
  const alreadySubmitted = (a.type !== "poll" && a.type !== "poll_pie") && localStorage.getItem(SUBMIT_KEY(a.activity_id));
  void alreadyVoted; // suppress lint — read below for poll branch

  if (a.type === "poll" || a.type === "poll_pie" || a.type === "poll_multi") {
    show("poll-card");
    renderPoll(a);
  } else if (a.type === "ordering") {
    // For ordering we want to *keep showing the graded list* on revisit
    // instead of jumping to the bare confirmation panel — that's where the
    // student sees which slots they got right.
    show("order-form");
    renderOrdering(a);
    if (alreadySubmitted) {
      const grade = readGrade(a.activity_id);
      if (grade) {
        const list = $("order-items");
        // Reorder DOM to match the student's submitted order so the
        // grading colors line up with what they actually answered.
        const subKey = `classpp.order.${a.activity_id}`;
        const savedOrder = localStorage.getItem(subKey);
        if (savedOrder) {
          const want = savedOrder.split(",");
          want.forEach(origIdx => {
            const el = list.querySelector(`[data-original-index="${origIdx}"]`);
            if (el) list.appendChild(el);
          });
        }
        applyOrderingGrade(list, grade.is_correct);
        const btn = $("order-submit-btn");
        if (btn) {
          btn.disabled = true;
          btn.textContent = grade.is_correct ? "Correct ✓" : grade.is_correct === false ? "Submitted — see below" : "Submitted ✓";
        }
      } else {
        show("confirm-card");
      }
    }
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
// Persisted grading verdict: { is_correct, correct_answer } stringified.
// Lets the student see the correct/incorrect banner on revisit/refresh.
const GRADE_KEY = (id) => `classpp.grade.${id}`;
function saveGrade(id, verdict) {
  try { localStorage.setItem(GRADE_KEY(id), JSON.stringify(verdict || {})); } catch {}
}
function readGrade(id) {
  try { return JSON.parse(localStorage.getItem(GRADE_KEY(id)) || "null"); }
  catch { return null; }
}

function renderPoll(a) {
  const container = $("poll-options-list");
  container.innerHTML = "";
  // Drop any previous grading banner from a different activity.
  document.getElementById("grading-banner")?.remove();

  const options = JSON.parse(a.poll_options || "[]");
  const letters = "ABCDEFGHIJKLMNOP";
  const isMulti = a.type === "poll_multi";

  const priorRaw = localStorage.getItem(VOTE_KEY(a.activity_id));
  const prior = priorRaw === null ? new Set()
              : new Set(priorRaw.split(",").filter(s => s !== "").map(s => parseInt(s, 10)));
  const priorGrade = readGrade(a.activity_id);

  options.forEach((opt, idx) => {
    const tile = document.createElement("button");
    tile.className = "poll-tile";
    tile.type = "button";
    tile.dataset.index = idx;
    const marker = isMulti
      ? `<span class="poll-tile-checkbox" aria-hidden="true"></span>`
      : `<span class="poll-tile-letter">${letters[idx] || idx + 1}</span>`;
    tile.innerHTML = `${marker}<span class="poll-tile-text">${md(opt)}</span>`;
    if (prior.has(idx)) tile.classList.add("selected");

    tile.addEventListener("click", async () => {
      if (isMulti) tile.classList.toggle("selected");
      else await submitPollAnswer(a, [idx], container, /*single*/ true);
    });

    container.appendChild(tile);
  });

  if (isMulti) {
    const submit = document.createElement("button");
    submit.type = "button";
    submit.id = "poll-multi-submit";
    submit.textContent = prior.size ? "Update answer" : "Submit answer";
    submit.style.width = "100%";
    submit.style.marginTop = "0.85rem";
    submit.addEventListener("click", async () => {
      const picked = [...container.querySelectorAll(".poll-tile.selected")]
        .map(el => parseInt(el.dataset.index, 10));
      if (!picked.length) {
        setStatusEl("poll-status", "Pick at least one option, then Submit.", "error");
        return;
      }
      await submitPollAnswer(a, picked, container, /*single*/ false);
    });
    container.appendChild(submit);
  }

  // If we already know a grade (because the student answered earlier),
  // rehydrate the verdict banner + per-tile correctness coloring.
  if (prior.size && priorGrade) {
    applyPollGrade(container, a, prior, priorGrade, isMulti);
  } else if (prior.size) {
    setStatusEl("poll-status", isMulti
      ? "You already answered — change your selection and click Update."
      : "You already answered — live results below.", "success");
    if (!isMulti) container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
    showPollResults(a);
  }

  if (window.lucide) window.lucide.createIcons();
}

async function submitPollAnswer(a, indices, container, single) {
  setStatusEl("poll-status", "Recording your answer…");
  if (single) container.querySelectorAll(".poll-tile").forEach(b => b.disabled = true);
  try {
    const res = await api.vote(a.activity_id, indices.length === 1 && single ? indices[0] : null, indices);
    container.querySelectorAll(".poll-tile").forEach(b => {
      const idx = parseInt(b.dataset.index, 10);
      b.classList.toggle("selected", indices.includes(idx));
    });
    localStorage.setItem(VOTE_KEY(a.activity_id), indices.join(","));

    // Capture and apply grading verdict.
    const grade = { is_correct: res.is_correct, correct_answer: res.correct_answer };
    saveGrade(a.activity_id, grade);
    applyPollGrade(container, a, new Set(indices), grade, /*isMulti*/ a.type === "poll_multi");
    showPollResults(a);
  } catch (err) {
    if (single) container.querySelectorAll(".poll-tile").forEach(b => b.disabled = false);
    setStatusEl("poll-status", err.message, "error");
  }
}

// Annotate poll tiles + render the verdict banner based on a known grade.
// Works for both single and multi. Lock tiles after grading.
function applyPollGrade(container, a, chosenSet, grade, isMulti) {
  const correctSet = new Set();
  if (grade.correct_answer) {
    if (typeof grade.correct_answer.index === "number") correctSet.add(grade.correct_answer.index);
    if (Array.isArray(grade.correct_answer.indices)) grade.correct_answer.indices.forEach(i => correctSet.add(i));
  }

  // Apply per-tile classes.
  container.querySelectorAll(".poll-tile").forEach(tile => {
    const idx = parseInt(tile.dataset.index, 10);
    tile.classList.remove("correct", "incorrect", "correct-missed");
    const isChosen = chosenSet.has(idx);
    const isCorrect = correctSet.has(idx);
    if (correctSet.size === 0) { /* ungraded — leave selection only */ }
    else if (isChosen && isCorrect) tile.classList.add("correct");
    else if (isChosen && !isCorrect) tile.classList.add("incorrect");
    else if (!isChosen && isCorrect) tile.classList.add("correct-missed");
    tile.disabled = !isMulti;     // single-select locks; multi can be revised
  });

  // Update / replace the Submit button label for multi.
  const submitBtn = container.querySelector("#poll-multi-submit");
  if (submitBtn) submitBtn.textContent = "Update answer";

  // Banner.
  document.getElementById("grading-banner")?.remove();
  if (grade.is_correct === null || grade.is_correct === undefined) {
    setStatusEl("poll-status", "Answer recorded — this one isn't auto-graded.", "success");
    return;
  }
  const banner = document.createElement("div");
  banner.id = "grading-banner";
  banner.className = "grading-banner " + (grade.is_correct ? "grading-banner-correct" : "grading-banner-incorrect");
  banner.innerHTML = grade.is_correct
    ? `<span class="grading-icon">✓</span><div><strong>Correct!</strong><span>Well done. ${isMulti ? "Update if you want to change your answer." : ""}</span></div>`
    : `<span class="grading-icon">✗</span><div><strong>Not quite.</strong><span>The correct option${correctSet.size > 1 ? "s are" : " is"} highlighted in green.</span></div>`;
  container.parentNode.insertBefore(banner, container);
  setStatusEl("poll-status", "");   // clear any old status
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
        <span class="results-count">${total} answer${total !== 1 ? "s" : ""}</span>
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
                <span class="result-label">${mdInline(opt)}</span>
                ${mine ? `<span class="result-mine-badge"><i data-lucide="check"></i> Your answer</span>` : ""}
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
      <span class="order-text">${mdInline(entry.item)}</span>`;
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

function showPicker(activities) {
  hide("loading"); hide("form-card"); hide("empty");
  const grid = $("picker-list");
  grid.innerHTML = "";
  activities.forEach(a => {
    const card = document.createElement("button");
    card.className = "picker-card";
    card.type = "button";
    const PICKER_ICON = {
      poll: "bar-chart-2", poll_pie: "pie-chart", poll_multi: "check-square",
      rating: "star", word_cloud: "cloud", submission: "file-text", ordering: "arrow-up-down",
    };
    // Picker cards have very limited width, so the preview is plain text
    // only — no Markdown rendering, no inline code, no <strong>. The full
    // formatted prompt renders once the student clicks into the activity.
    const preview = previewText(a.prompt, 130);
    card.innerHTML = `
      <div class="picker-card-icon"><i data-lucide="${PICKER_ICON[a.type]||"file-text"}" style="width:22px;height:22px;color:var(--brand);"></i></div>
      <div class="picker-card-title">${escapeHTML(preview)}</div>
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

  // If the user just landed via a QR / ?join=CODE link, enroll them now.
  await consumePendingJoin();

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

$("order-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const list = $("order-items");
  const order = [...list.querySelectorAll(".order-item")].map(el => el.dataset.originalIndex).join(",");
  const btn = $("order-submit-btn");
  if (btn) btn.disabled = true;
  setStatusEl("order-status", "Submitting your order…");
  try {
    const id = $("activity-id").value;
    const res = await api.submit({ activity_id: id, response: order });
    localStorage.setItem(SUBMIT_KEY(id), "1");
    localStorage.setItem(`classpp.order.${id}`, order);   // for revisit hydration
    saveGrade(id, { is_correct: res.is_correct, correct_answer: res.correct_answer });
    // Freeze the list and annotate each row with correctness; don't jump
    // away — the student should SEE which positions they nailed.
    applyOrderingGrade(list, res.is_correct);
    if (btn) {
      btn.disabled = true;
      btn.textContent = res.is_correct ? "Correct ✓" : res.is_correct === false ? "Submitted — see below" : "Submitted ✓";
    }
  } catch (err) {
    setStatusEl("order-status", err.message, "error");
    if (btn) btn.disabled = false;
  }
});

// Annotate every dragged item with whether it ended up in the canonical
// (correct) slot, plus inject a verdict banner above the list.
function applyOrderingGrade(list, isCorrect) {
  let inPlace = 0;
  const items = [...list.querySelectorAll(".order-item")];
  items.forEach((el, pos) => {
    const origIdx = parseInt(el.dataset.originalIndex, 10);
    el.classList.remove("correct-pos", "wrong-pos");
    if (origIdx === pos) { el.classList.add("correct-pos"); inPlace++; }
    else el.classList.add("wrong-pos");
  });
  // Freeze drag.
  if (orderSortable) { orderSortable.option("disabled", true); }

  // Banner.
  document.getElementById("grading-banner")?.remove();
  const banner = document.createElement("div");
  banner.id = "grading-banner";
  banner.className = "grading-banner " + (isCorrect ? "grading-banner-correct" : "grading-banner-incorrect");
  banner.innerHTML = isCorrect
    ? `<span class="grading-icon">✓</span><div><strong>Correct order!</strong><span>All ${items.length} items in the right place.</span></div>`
    : `<span class="grading-icon">✗</span><div><strong>Not quite.</strong><span>${inPlace} of ${items.length} items are in the right slot (highlighted green). The rest are red.</span></div>`;
  list.parentNode.insertBefore(banner, list);
}

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

// Detect a pending class-join from the URL (?join=ABC123). Either run it
// now (if signed in) or stash it for after sign-in.
(function captureJoinCode() {
  const url = new URL(location.href);
  const code = (url.searchParams.get("join") || "").toUpperCase();
  if (code && /^[A-Z2-9]{6}$/.test(code)) {
    localStorage.setItem("classpp.pending_join", code);
    // Strip from URL so the page is bookmarkable / shareable cleanly.
    url.searchParams.delete("join");
    history.replaceState({}, "", url.toString());
  }
})();

async function consumePendingJoin() {
  const code = localStorage.getItem("classpp.pending_join");
  if (!code) return;
  try {
    const res = await api.selfEnrollByCode(code);
    localStorage.removeItem("classpp.pending_join");
    if (res && res.class) {
      toast(`Joined <strong>${escapeHTML(res.class.name)}</strong> ✓`, "success");
    }
  } catch (err) {
    localStorage.removeItem("classpp.pending_join");
    toast("Couldn't join class: " + (err.message || "unknown error"), "error");
  }
}

mountSettingsDrawer({
  api,
  session,
  onSignOut: () => { disconnectSSE(); api.signOut(); location.reload(); },
});

if (session.token) showSignedInState();
else showSignInState();
