const POSTS_DIR = "/blog/posts";

/**
 * Minimal YAML-ish frontmatter: key: value lines between --- fences.
 * Supports tags as JSON arrays on one line: tags: ["a","b"]
 * @returns {{ meta: Record<string, unknown>, body: string }}
 */
function splitMarkdownPost(raw) {
  const trimmed = raw.replace(/^\ufeff/, "");
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: trimmed };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: trimmed };
  const head = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, "");
  /** @type Record<string, unknown> */
  const meta = {};
  for (const line of head.split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (key === "tags") {
      try {
        meta.tags = JSON.parse(val);
      } catch {
        meta.tags = [];
      }
      continue;
    }
    if (key === "week") {
      const n = parseInt(val, 10);
      if (!Number.isNaN(n)) meta.week = n;
      continue;
    }
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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
  } catch {
    /* fall back to library defaults */
  }
  window.__markedClassPlusConfigured = true;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function postMatchesSearch(p, q) {
  if (!q) return true;
  const hay = [p.title, p.summary, ...(p.tags || [])]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortPosts(posts, mode) {
  const copy = posts.slice();
  if (mode === "week") {
    copy.sort((a, b) => {
      const wa = a.week ?? 9999;
      const wb = b.week ?? 9999;
      if (wa !== wb) return wa - wb;
      return (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      });
    });
  } else if (mode === "title") {
    copy.sort((a, b) =>
      (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      }),
    );
  } else {
    copy.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  return copy;
}

function renderPostList(listEl, posts) {
  listEl.innerHTML = "";
  if (!posts.length) {
    listEl.innerHTML = `<li class="muted">No posts match.</li>`;
    return;
  }
  posts.forEach((p) => {
    const li = document.createElement("li");
    const badge =
      p.week != null
        ? `<span class="week-badge">Week ${escapeHTML(String(p.week))}</span> `
        : "";
    const tagLine =
      p.tags && p.tags.length
        ? `<div class="meta tags-line">${escapeHTML(p.tags.join(" · "))}</div>`
        : "";
    li.innerHTML = `
      <div class="blog-row">
        <div>
          ${badge}<a href="/blog/post.html?slug=${encodeURIComponent(p.slug)}">${escapeHTML(p.title)}</a>
          <div class="meta">${escapeHTML(p.date || "")} — ${escapeHTML(p.summary || "")}</div>
          ${tagLine}
        </div>
      </div>`;
    listEl.appendChild(li);
  });
}

let cachedPosts = null;

async function fetchPosts(listEl) {
  const res = await fetch(`${POSTS_DIR}/index.json`, { cache: "no-cache" });
  const posts = await res.json();
  if (!posts.length) {
    listEl.innerHTML = `<li class="muted">No posts yet.</li>`;
    return null;
  }
  cachedPosts = posts;
  return posts;
}

/**
 * @param {HTMLElement} listEl
 * @param {{ searchEl?: HTMLInputElement, sortEl?: HTMLSelectElement }} [options]
 */
export async function renderIndex(listEl, options = {}) {
  const { searchEl, sortEl } = options;
  try {
    const posts = await fetchPosts(listEl);
    if (!posts) return;

    function refresh() {
      const q = searchEl ? searchEl.value.trim() : "";
      const mode = sortEl ? sortEl.value : "date";
      const filtered = cachedPosts.filter((p) => postMatchesSearch(p, q));
      const sorted = sortPosts(filtered, mode);
      renderPostList(listEl, sorted);
    }

    if (searchEl) searchEl.addEventListener("input", refresh);
    if (sortEl) sortEl.addEventListener("change", refresh);
    refresh();
  } catch (err) {
    listEl.innerHTML = `<li class="muted">Could not load posts: ${escapeHTML(err.message)}</li>`;
  }
}

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
    const html = window.marked
      ? window.marked.parse(body)
      : `<pre>${escapeHTML(body)}</pre>`;
    const docTitle =
      typeof meta.title === "string" && meta.title.trim()
        ? meta.title.trim()
        : slug;
    const metaChip =
      typeof meta.date === "string" && meta.date
        ? `<p class="meta post-meta-line">${escapeHTML(meta.date)}${
            typeof meta.summary === "string" && meta.summary
              ? ` — ${escapeHTML(meta.summary)}`
              : ""
          }</p>`
        : "";
    container.innerHTML = `<p><a href="/blog/">← All notes</a></p>${metaChip}${html}`;
    document.title = `Class++ — ${docTitle}`;
  } catch (err) {
    container.innerHTML = `<p class="muted">Could not load post: ${escapeHTML(err.message)}</p>`;
  }
}
