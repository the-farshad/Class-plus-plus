const POSTS_DIR = "/blog/posts";

// ---------- Frontmatter parser ----------

function splitMarkdownPost(raw) {
  const trimmed = raw.replace(/^\ufeff/, "");
  if (!trimmed.startsWith("---")) return { meta: {}, body: trimmed };
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: trimmed };
  const head = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, "");
  const meta = {};
  for (const line of head.split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (key === "tags") {
      try { meta.tags = JSON.parse(val); } catch { meta.tags = []; }
      continue;
    }
    if (key === "week") {
      const n = parseInt(val, 10);
      if (!Number.isNaN(n)) meta.week = n;
      continue;
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    meta[key] = val;
  }
  return { meta, body };
}

function ensureMarkedConfigured() {
  if (!window.marked || window.__markedClassPlusConfigured) return;
  try {
    if (typeof marked.use === "function") {
      marked.use({ gfm: true, breaks: false });
    } else if (typeof marked.setOptions === "function") {
      marked.setOptions({ gfm: true, breaks: false });
    }
  } catch { /* use library defaults */ }
  window.__markedClassPlusConfigured = true;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Estimated reading time ----------

function readingTime(text) {
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

// ---------- Filtering & sorting ----------

function postMatchesSearch(p, q, activeTag) {
  if (activeTag && !(p.tags || []).includes(activeTag)) return false;
  if (!q) return true;
  const hay = [p.title, p.summary, ...(p.tags || [])].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortPosts(posts, mode) {
  const copy = posts.slice();
  if (mode === "week") {
    copy.sort((a, b) => {
      const wa = a.week ?? 9999, wb = b.week ?? 9999;
      if (wa !== wb) return wa - wb;
      return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
    });
  } else if (mode === "title") {
    copy.sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
  } else {
    copy.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  return copy;
}

// ---------- Render post list ----------

function renderPostList(listEl, posts, noResultsEl) {
  listEl.innerHTML = "";
  if (noResultsEl) noResultsEl.style.display = posts.length ? "none" : "";

  if (!posts.length) return;

  posts.forEach((p) => {
    const li = document.createElement("li");

    const badge = p.week != null
      ? `<span class="week-badge">Week ${p.week}</span>`
      : "";

    const rt = readingTime([p.title, p.summary].join(" "));

    li.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem;">
          ${badge}
          <a href="/blog/post.html?slug=${encodeURIComponent(p.slug)}" style="font-weight:600;font-size:0.97rem;">${escapeHTML(p.title)}</a>
        </div>
        <div class="meta">${escapeHTML(p.summary || "")}</div>
        <span class="reading-time" style="margin-top:0.3rem;display:inline-flex;">
          <i data-lucide="clock" style="width:11px;height:11px;"></i> ${escapeHTML(rt)}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
        <span class="muted" style="font-size:0.78rem;white-space:nowrap;">${escapeHTML(p.date || "")}</span>
        <a href="/blog/post.html?slug=${encodeURIComponent(p.slug)}" class="button sm secondary" style="text-decoration:none;">Read →</a>
      </div>`;

    listEl.appendChild(li);
  });

  // Re-render lucide icons if available
  if (window.lucide) window.lucide.createIcons();
}

// ---------- Tag select builder ----------

function buildTagSelect(selectEl, posts, getActiveTag, setActiveTag, refresh) {
  if (!selectEl) return;

  // Count frequency of each tag
  const freq = {};
  posts.forEach(p => (p.tags || []).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));

  // Sort by frequency desc, then alpha; keep only tags that appear 2+ times
  // plus a broad list of conceptual groupings always shown regardless of count
  const pinned = new Set(["classes","memory","functions","loops","pointers","inheritance","polymorphism","file-io","vector","stl","oop","recursion","templates","exceptions"]);
  const tags = Object.entries(freq)
    .filter(([t, c]) => c >= 2 || pinned.has(t))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  // Rebuild options
  selectEl.innerHTML = `<option value="">All topics</option>`;
  tags.forEach(tag => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag + (freq[tag] > 1 ? ` (${freq[tag]})` : "");
    if (getActiveTag() === tag) opt.selected = true;
    selectEl.appendChild(opt);
  });

  selectEl.addEventListener("change", () => {
    setActiveTag(selectEl.value || null);
    refresh();
  });
}

// ---------- Public: renderIndex ----------

let cachedPosts = null;

export async function renderIndex(listEl, options = {}) {
  const { searchEl, sortEl, tagFilterEl, countEl, noResults, clearBtn } = options;
  let activeTag = null;

  listEl.innerHTML = `<li class="muted" style="padding:1.5rem 0;">Loading…</li>`;

  try {
    const res = await fetch(`${POSTS_DIR}/index.json`, { cache: "no-cache" });
    const posts = await res.json();
    cachedPosts = posts;

    if (countEl) {
      const weekly = posts.filter(p => p.week != null).length;
      countEl.textContent = `— ${posts.length} notes, ${weekly} weekly`;
    }

    function refresh() {
      const q = searchEl ? searchEl.value.trim() : "";
      const mode = sortEl ? sortEl.value : "week";
      const filtered = cachedPosts.filter(p => postMatchesSearch(p, q, activeTag));
      const sorted = sortPosts(filtered, mode);
      renderPostList(listEl, sorted, noResults || null);
    }

    if (searchEl) searchEl.addEventListener("input", refresh);
    if (sortEl)   sortEl.addEventListener("change", refresh);
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchEl) searchEl.value = "";
        activeTag = null;
        if (tagFilterEl) tagFilterEl.value = "";
        refresh();
      });
    }

    buildTagSelect(tagFilterEl, posts, () => activeTag, t => { activeTag = t; }, refresh);
    refresh();
  } catch (err) {
    listEl.innerHTML = `<li class="muted">Could not load posts: ${escapeHTML(err.message)}</li>`;
  }
}

// ---------- Public: renderPost ----------

export async function renderPost(container) {
  const slug = new URLSearchParams(location.search).get("slug");
  if (!slug) {
    container.innerHTML = `<p class="muted">Missing post slug.</p>`;
    return;
  }
  try {
    const res = await fetch(`${POSTS_DIR}/${encodeURIComponent(slug)}.md`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Not found (${res.status})`);
    const md = await res.text();
    const { meta, body } = splitMarkdownPost(md);

    ensureMarkedConfigured();
    const html = window.marked ? window.marked.parse(body) : `<pre>${escapeHTML(body)}</pre>`;

    const docTitle = (typeof meta.title === "string" && meta.title.trim()) ? meta.title.trim() : slug;
    document.title = `Class++ — ${docTitle}`;

    // Build meta line
    const parts = [];
    if (meta.date) parts.push(escapeHTML(meta.date));
    if (meta.week != null) parts.push(`<span class="week-badge">Week ${escapeHTML(String(meta.week))}</span>`);
    const rt = readingTime(body);
    parts.push(`<span class="reading-time"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${escapeHTML(rt)}</span>`);
    if (meta.summary) parts.push(`<span>${escapeHTML(meta.summary)}</span>`);

    const metaLine = parts.length
      ? `<div class="post-meta-line">${parts.join('<span style="color:var(--border);">·</span>')}</div>`
      : "";

    // Remove skeleton
    const skeleton = document.getElementById("post-skeleton");
    if (skeleton) skeleton.remove();

    container.innerHTML = metaLine + html;

    // Apply Prism.js highlighting after content is in DOM
    if (window.Prism) {
      container.querySelectorAll("pre code").forEach(block => {
        // Detect language from fence class or default to cpp
        if (!block.className) block.className = "language-cpp";
        Prism.highlightElement(block);
      });
    } else {
      // Wait for Prism to load then highlight
      window.addEventListener("load", () => {
        if (!window.Prism) return;
        container.querySelectorAll("pre code").forEach(block => {
          if (!block.className) block.className = "language-cpp";
          Prism.highlightElement(block);
        });
      });
    }

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    const skeleton = document.getElementById("post-skeleton");
    if (skeleton) skeleton.remove();
    const is404 = err.message.includes("404") || err.message.includes("Not found");
    container.innerHTML = `
      <p style="color:var(--error);font-weight:600;margin-bottom:0.5rem;">
        ${is404 ? "Note not found" : "Could not load note"}
      </p>
      <p class="muted" style="font-size:0.88rem;">${escapeHTML(err.message)}</p>
      <a href="/blog/" class="button secondary sm" style="margin-top:1rem;text-decoration:none;">← Back to all notes</a>`;
  }
}
