const POSTS_DIR = "/blog/posts";

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export async function renderIndex(listEl) {
  try {
    const res = await fetch(`${POSTS_DIR}/index.json`, { cache: "no-cache" });
    const posts = await res.json();
    listEl.innerHTML = "";
    if (!posts.length) {
      listEl.innerHTML = `<li class="muted">No posts yet.</li>`;
      return;
    }
    posts
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((p) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <div><a href="/blog/post.html?slug=${encodeURIComponent(p.slug)}">${escapeHTML(p.title)}</a></div>
            <div class="meta">${escapeHTML(p.date || "")} — ${escapeHTML(p.summary || "")}</div>
          </div>`;
        listEl.appendChild(li);
      });
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
    const html = window.marked ? window.marked.parse(md) : `<pre>${escapeHTML(md)}</pre>`;
    container.innerHTML = `<p><a href="/blog/">← All notes</a></p>${html}`;
    document.title = `Class++ — ${slug}`;
  } catch (err) {
    container.innerHTML = `<p class="muted">Could not load post: ${escapeHTML(err.message)}</p>`;
  }
}
