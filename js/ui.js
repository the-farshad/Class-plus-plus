// Shared UI helpers used across student, instructor, and blog pages.
// Kept dependency-free — pure DOM utilities.

export const $ = (id) => document.getElementById(id);
export const show = (id) => { const el = $(id); if (el) el.hidden = false; };
export const hide = (id) => { const el = $(id); if (el) el.hidden = true; };

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function setStatus(id, msg, kind = "") {
  const el = typeof id === "string" ? $(id) : id;
  if (!el) return;
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

// Mark all rendered lucide SVGs as decorative so screen readers ignore them.
// Lucide replaces <i data-lucide="..."> with an <svg class="lucide ..."> element;
// we run this after each createIcons() invocation.
export function decorateLucideIcons(root = document) {
  root.querySelectorAll("svg.lucide, [data-lucide]").forEach((el) => {
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("focusable", "false");
  });
}

// Re-render lucide icons and immediately mark them decorative.
export function renderIcons(root = document) {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons({ root });
  }
  decorateLucideIcons(root);
}

// Make every .status region a polite live region so screen-reader users
// hear "Submitting…" / errors / success messages as the form updates.
export function decorateStatusRegions(root = document) {
  root.querySelectorAll(".status").forEach((el) => {
    if (!el.hasAttribute("aria-live")) el.setAttribute("aria-live", "polite");
    if (!el.hasAttribute("aria-atomic")) el.setAttribute("aria-atomic", "true");
  });
}

// Inject a "skip to main content" link as the very first focusable element.
// It's visually hidden until a keyboard user tabs onto it.
export function ensureSkipLink() {
  if (document.querySelector(".skip-to-main")) return;
  const target = document.querySelector("main") || document.querySelector("article");
  if (!target) return;
  if (!target.id) target.id = "main-content";
  const link = document.createElement("a");
  link.href = "#" + target.id;
  link.className = "skip-to-main";
  link.textContent = "Skip to main content";
  document.body.insertBefore(link, document.body.firstChild);
}

// Patch window.lucide.createIcons so every render — including the ones called
// directly from instructor.js / blog.js after dynamic DOM updates — automatically
// marks new SVGs as decorative.
function patchLucide() {
  if (!window.lucide || window.__classpp_lucide_patched) return;
  const orig = window.lucide.createIcons;
  if (typeof orig !== "function") return;
  window.lucide.createIcons = function (opts) {
    const r = orig.call(window.lucide, opts);
    decorateLucideIcons(opts && opts.root ? opts.root : document);
    return r;
  };
  window.__classpp_lucide_patched = true;
}

// Render the current build number into every [data-version] slot on the page.
// Also injects a small build chip into .footer-meta containers that don't
// already advertise a version, so any footer shows it without HTML edits.
export async function renderVersion() {
  let v;
  try {
    ({ VERSION: v } = await import("/js/version.js"));
  } catch {
    return;
  }
  const label = `v${v.version}`;
  const tooltip = `Build ${v.build} · ${v.builtAt}`;

  document.querySelectorAll("[data-version]").forEach((el) => {
    el.textContent = label;
    el.title = tooltip;
  });

  document.querySelectorAll(".footer-meta").forEach((el) => {
    if (el.querySelector("[data-version]")) return;
    const chip = document.createElement("span");
    chip.dataset.version = "";
    chip.textContent = label;
    chip.title = tooltip;
    el.appendChild(chip);
  });
}

// One-call page bootstrap: render icons, mark regions, inject skip link.
// Safe to call multiple times.
export function bootPage() {
  ensureSkipLink();
  renderVersion();
  // Lucide loads asynchronously via the CDN <script> tag. If it isn't ready yet
  // we poll briefly — the icons placeholder elements stay hidden via CSS until
  // SVGs are injected, so a 50–200ms delay is invisible.
  const tryBoot = (attempt = 0) => {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      patchLucide();
      renderIcons();
    } else if (attempt < 25) {
      setTimeout(() => tryBoot(attempt + 1), 50);
    }
  };
  tryBoot();
  decorateStatusRegions();
}

// Populate the navbar user pill from the current session user.
// Sets the avatar initial, truncated email, and a role badge.
export function updateUserPill(user) {
  const pill = $("btn-settings");
  const avatar = $("user-avatar");
  const emailEl = $("user-pill-email");
  const roleEl = $("user-pill-role");

  if (!user || !user.email) return;

  const email = user.email;
  const initial = (email[0] || "?").toUpperCase();
  if (avatar) avatar.textContent = initial;
  if (emailEl) emailEl.textContent = email;
  if (roleEl) {
    const role = user.role || "student";
    const label = role === "superadmin" ? "Superadmin" : role === "instructor" ? "Instructor" : "Student";
    roleEl.textContent = label;
    roleEl.className = "user-role " + role;
  }
  if (pill) pill.hidden = false;
}

// Mount the settings drawer (theme switcher + signed-in email + sign-out).
// Assumes the markup with these IDs exists somewhere on the page.
export function mountSettingsDrawer({ api, session, onSignOut } = {}) {
  const btn = $("btn-settings");
  const modal = $("modal-settings");
  const overlay = $("modal-overlay-settings");
  const closeBtn = $("close-settings");
  const sel = $("theme-selector");
  if (!btn || !modal || !overlay || !sel) return;

  let lastFocus = null;

  sel.value = document.documentElement.getAttribute("data-theme") || "light";
  sel.addEventListener("change", () => api?.setTheme(sel.value));

  function open() {
    lastFocus = document.activeElement;
    sel.value = document.documentElement.getAttribute("data-theme") || "light";
    const emailEl = $("settings-email");
    if (emailEl && session?.user) emailEl.textContent = session.user.email;
    modal.hidden = false;
    overlay.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    closeBtn?.focus();
  }
  function close() {
    modal.hidden = true;
    overlay.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  btn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  const signoutBtn = $("signout");
  if (signoutBtn && onSignOut) {
    signoutBtn.addEventListener("click", onSignOut);
  }
}
