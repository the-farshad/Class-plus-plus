// Live "Due in 3h 12m" chips, shared between the student and instructor
// pages. Drop a `<span class="due-countdown" data-due="<ms>">…</span>` in
// the DOM and the single 1-Hz tick will refresh text + urgency classes
// in place.
//
// Why a single global interval (not one per element):
//   - Cheaper than N timers when an instructor opens a long list of
//     activities, each with its own due date.
//   - Survives DOM churn — adding/removing chips doesn't require any
//     bookkeeping. The next tick simply re-queries.

const TICK_MS = 1000;
let started = false;
const overdueCallbacks = new Set();

// Stringify a non-negative duration. Granularity adapts to size so we
// don't spam ".. 47s left" on a 5-day due date.
export function fmtDuration(ms) {
  const abs = Math.max(0, Math.abs(ms));
  const sec = Math.floor(abs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 5)  return `${min}m ${sec % 60}s`;
  if (min < 60) return `${min}m`;
  const hr  = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ${hr % 24}h`;
  return `${day}d`;
}

// Build the human-readable label for a due timestamp. Past dates flip
// the phrasing rather than going negative.
export function dueLabel(dueAt) {
  const ms = dueAt - Date.now();
  return ms <= 0
    ? `Past due · ${fmtDuration(ms)} ago`
    : `Due in ${fmtDuration(ms)}`;
}

// Emit the HTML for a single due chip. Caller controls the className
// so visual styles can vary between picker-card / heading / table-row.
export function dueChipHTML(dueAt, opts = {}) {
  if (!dueAt) return "";
  const cls = `due-countdown ${opts.className || "due-badge"}`.trim();
  const tip = new Date(dueAt).toLocaleString();
  return `<span class="${cls}" data-due="${dueAt}" title="${tip}">${dueLabel(dueAt)}</span>`;
}

// Subscribe to the transition future→past for any tracked chip. The
// callback fires once per chip the moment it crosses zero, with the
// HTML element as its argument. Student page uses this to lock the
// activity form when the live countdown ends mid-session.
export function onOverdue(cb) { overdueCallbacks.add(cb); }

export function startDueCountdowns() {
  if (started) return;
  started = true;

  function tick() {
    // Pause text updates when the tab is hidden. The chip will catch up
    // on the next visible tick — and meanwhile we're not burning CPU.
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    document.querySelectorAll(".due-countdown[data-due]").forEach(el => {
      const due = parseInt(el.dataset.due, 10);
      if (!Number.isFinite(due)) return;
      const rem = due - now;
      el.textContent = dueLabel(due);

      const wasOverdue = el.classList.contains("overdue");
      const isOverdue  = rem <= 0;
      const isUrgent   = rem > 0 && rem < 60 * 60 * 1000;          // <1h
      const isWarn     = rem >= 60 * 60 * 1000 && rem < 6 * 60 * 60 * 1000; // 1-6h

      el.classList.toggle("overdue", isOverdue);
      el.classList.toggle("urgent",  isUrgent);
      el.classList.toggle("warn",    isWarn);

      if (!wasOverdue && isOverdue) {
        overdueCallbacks.forEach(cb => { try { cb(el); } catch {} });
      }
    });
  }
  tick();
  setInterval(tick, TICK_MS);
}
