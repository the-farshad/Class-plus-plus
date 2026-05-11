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

// Wire any .float-field-toggle buttons (the eye icon inside password
// inputs) to toggle the input type between password and text. Idempotent.
export function wirePasswordToggles(root = document) {
  root.querySelectorAll(".float-field-toggle").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    const targetId = btn.dataset.toggle;
    const input = document.getElementById(targetId);
    if (!input) return;
    btn.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.innerHTML = `<i data-lucide="${showing ? "eye" : "eye-off"}"></i>`;
      if (window.lucide) window.lucide.createIcons({ root: btn });
    });
  });
}

// One-call page bootstrap: render icons, mark regions, inject skip link.
// Safe to call multiple times.
export function bootPage() {
  ensureSkipLink();
  renderVersion();
  showSigninCtaIfNeeded();
  wirePasswordToggles();
  // Populate the user pill from localStorage on every page so signed-in
  // users never see "Guest" on pages that don't have their own auth flow
  // (e.g. /blog/, /blog/post.html, /404.html). Pages that do drive auth
  // (student.js, instructor.js) will re-call updateUserPill themselves
  // with the freshly-validated user.
  try {
    const raw = localStorage.getItem("classpp.user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.email) updateUserPill(user);
    }
  } catch { /* corrupt localStorage — leave pill at its default state */ }
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
  const signinCta = $("nav-signin");

  if (!user || !user.email) {
    // Signed-out: hide the pill, surface the Sign-in CTA in the navbar.
    if (pill) pill.hidden = true;
    if (signinCta) signinCta.hidden = false;
    return;
  }

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
  if (signinCta) signinCta.hidden = true;

  // Reveal the Dashboard nav link only for instructors / superadmins.
  const navAdmin = $("nav-admin");
  if (navAdmin) {
    navAdmin.hidden = !(user.role === "instructor" || user.role === "superadmin");
  }
  // Reveal the Live link to any signed-in user (it was hidden by default
  // on the Notes pages so guests see "just Notes").
  const navSubmit = $("nav-submit");
  if (navSubmit) navSubmit.hidden = false;
}

// On every page boot, reveal the navbar Sign-in CTA when no session token
// is present. Pages that have their own sign-in flow (student / instructor)
// will call updateUserPill() later to flip this back off once signed in.
export function showSigninCtaIfNeeded() {
  const token = localStorage.getItem("classpp.jwt");
  const cta = $("nav-signin");
  if (!cta || token) return;
  // If this page already has a visible sign-in card (student / instructor
  // sign-in flow), the navbar CTA is redundant — skip it.
  const signinCard = document.getElementById("signin-card");
  if (signinCard && !signinCard.hidden) return;
  cta.hidden = false;
}

// Wire the "Sign in with UWYO/Microsoft" button using MSAL (loaded via the
// alcdn.msauth.net script tag in each page's <head>). Activates only when
// the server's /auth/config exposes a microsoft_client_id. On success,
// passes the Microsoft ID token to onSuccess(idToken) which is expected
// to post it to /auth/microsoft and complete the session.
//
// Returns a Promise that resolves once the button is wired (or no-op'd).
export async function setupMicrosoftSignIn({ cfg, onSuccess, onError, statusEl } = {}) {
  const btn = $("btn-ms-signin");
  const sep = $("signin-or");
  if (!btn) return;

  if (!cfg || !cfg.microsoft_client_id) {
    btn.hidden = true;
    if (sep) sep.hidden = true;
    return;
  }

  // Wait for MSAL to finish loading (the <script> is deferred). Cap retries.
  const waitForMsal = async () => {
    for (let i = 0; i < 50 && !(window.msal && window.msal.PublicClientApplication); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!(window.msal && window.msal.PublicClientApplication);
  };
  const ok = await waitForMsal();
  if (!ok) {
    if (statusEl) setStatus(statusEl, "Microsoft sign-in failed to load — try Google.", "error");
    return;
  }

  const tenant = cfg.microsoft_tenant_id || "common";
  const msalInstance = new window.msal.PublicClientApplication({
    auth: {
      clientId: cfg.microsoft_client_id,
      authority: `https://login.microsoftonline.com/${tenant}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
  });
  await msalInstance.initialize();

  btn.hidden = false;
  if (sep) sep.hidden = false;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (statusEl) setStatus(statusEl, "Opening Microsoft sign-in…");
    try {
      const result = await msalInstance.loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
      });
      const idToken = result && result.idToken;
      if (!idToken) throw new Error("No id_token returned from Microsoft");
      await onSuccess(idToken);
    } catch (err) {
      // User-cancelled popup throws BrowserAuthError(user_cancelled) — quiet that.
      const cancelled = err && (err.errorCode === "user_cancelled" || /cancel/i.test(err.message || ""));
      if (!cancelled) {
        const msg = (err && err.message) || "Microsoft sign-in failed";
        if (statusEl) setStatus(statusEl, msg, "error");
        if (typeof onError === "function") onError(err);
      }
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Toast (replaces alert) ----------
// Tiny themed message that pops in at the bottom of the viewport and
// auto-dismisses. kind: "info" | "success" | "error" | "warning".
export function toast(message, kind = "info", durationMs = 4000) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast toast-" + kind;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = String(message);
  host.appendChild(el);
  // entrance animation
  requestAnimationFrame(() => el.classList.add("toast-in"));
  const close = () => {
    el.classList.remove("toast-in");
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener("click", close);
  setTimeout(close, durationMs);
}

// ---------- Themed confirm (replaces window.confirm) ----------
// Returns a Promise<boolean>: resolves to true on confirm, false on cancel.
// opts: { title, message, confirmLabel, cancelLabel, danger? }
export function confirmDialog(opts = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = opts;

  return new Promise((resolve) => {
    let overlay = document.getElementById("confirm-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "confirm-overlay";
      overlay.className = "modal-overlay";
      document.body.appendChild(overlay);
    }
    const modal = document.createElement("div");
    modal.className = "modal-center confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.style.maxWidth = "440px";
    modal.innerHTML = `
      <h3 style="margin:0 0 0.5rem;font-size:1.05rem;">${escapeHTML(title)}</h3>
      <p style="margin:0 0 1.25rem;color:var(--muted);font-size:0.92rem;line-height:1.5;">${message}</p>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <button type="button" class="secondary sm" data-confirm-cancel>${escapeHTML(cancelLabel)}</button>
        <button type="button" class="${danger ? "danger" : ""}" data-confirm-ok>${escapeHTML(confirmLabel)}</button>
      </div>`;
    document.body.appendChild(modal);
    overlay.hidden = false;

    const done = (v) => {
      overlay.hidden = true;
      modal.remove();
      cleanup();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === "Escape") done(false); else if (e.key === "Enter") done(true); };
    const cleanup = () => document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);

    modal.querySelector("[data-confirm-ok]").addEventListener("click", () => done(true));
    modal.querySelector("[data-confirm-cancel]").addEventListener("click", () => done(false));
    overlay.addEventListener("click", () => done(false), { once: true });
    modal.querySelector("[data-confirm-ok]").focus();
  });
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
