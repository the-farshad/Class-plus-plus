// Frontend API client for the Class++ backend.
// API_BASE_URL is overridable via localStorage.classpp.api_base for local dev:
//   localStorage.setItem('classpp.api_base', 'http://localhost:3001')

const DEFAULT_API_BASE = "https://api.thefarshad.com";
export const API_BASE_URL =
  (typeof localStorage !== "undefined" && localStorage.getItem("classpp.api_base"))
  || DEFAULT_API_BASE;

const JWT_KEY = "classpp.jwt";
const USER_KEY = "classpp.user";

export const session = {
  get token() { return localStorage.getItem(JWT_KEY) || ""; },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  },
  set(token, user) {
    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

function authHeaders() {
  const t = session.token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle(res) {
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Bad JSON from ${res.url}: ${text.slice(0, 80)}`); }
  if (!res.ok || data.ok === false) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    if (res.status === 401) session.clear();
    throw new Error(msg);
  }
  return data;
}

async function get(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  return handle(res);
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body || {}),
  });
  return handle(res);
}

async function postForm(path, formData) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),  // do NOT set Content-Type — browser sets boundary
    body: formData,
  });
  return handle(res);
}

async function patchJSON(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body || {}),
  });
  return handle(res);
}

async function del(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle(res);
}

// Map data-theme → the color the OS chrome should match.
const THEME_COLORS = {
  light:           "#2563eb",
  dark:            "#0f1117",
  uwyo:            "#492f24",
  sepia:           "#f5edd8",
  "high-contrast": "#000000",
};
function syncThemeColor(theme) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme] || THEME_COLORS.light;
}

export const api = {
  // Theme Management
  initTheme: () => {
    const saved = localStorage.getItem("classpp.theme");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved || system;
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeColor(theme);
  },
  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("classpp.theme", theme);
    syncThemeColor(theme);
    return theme;
  },

  // Auth / config
  authConfig: () => get("/auth/config"),
  signIn: async (idToken) => {
    const res = await postJSON("/auth/google", { id_token: idToken });
    if (res.ok) session.set(res.token, res.user);
    return res;
  },
  signInWithMicrosoft: async (idToken) => {
    const res = await postJSON("/auth/microsoft", { id_token: idToken });
    if (res.ok) session.set(res.token, res.user);
    return res;
  },
  signInWithPassword: async (email, password) => {
    const res = await postJSON("/auth/password", { email, password });
    if (res.ok) session.set(res.token, res.user);
    return res;
  },
  signOut: () => session.clear(),

  // Activities
  listOpenActivities: (classId) => get(`/activities${classId ? `?class_id=${classId}` : ""}`),
  getActivity: (id) => get(`/activities/${encodeURIComponent(id)}`),
  listAllActivities: (classId) => get(`/activities/admin/all${classId ? `?class_id=${classId}` : ""}`),
  createActivity: (prompt, classId, type, options, sessionTag = null, releaseAt = null, dueAt = null) =>
    postJSON("/activities/admin", {
      prompt, class_id: classId, type,
      poll_options: options,
      session_tag: sessionTag,
      release_at: releaseAt,
      due_at: dueAt,
    }),
  setActivityStatus: (id, status) =>
    patchJSON(`/activities/admin/${encodeURIComponent(id)}`, { status }),
  updateActivity: (id, payload) =>
    patchJSON(`/activities/admin/${encodeURIComponent(id)}`, payload),
  deleteActivity: (id) => del(`/activities/admin/${encodeURIComponent(id)}`),
  vote: (id, optionIndex) => postJSON(`/activities/${encodeURIComponent(id)}/vote`, { option_index: optionIndex }),
  getResults: (id) => get(`/activities/${encodeURIComponent(id)}/results`),

  // Submissions
  submit: ({ activity_id, response, file }) => {
    const fd = new FormData();
    fd.append("activity_id", String(activity_id));
    fd.append("response", response);
    if (file) fd.append("file", file);
    return postForm("/submissions", fd);
  },
  listSubmissions: (activityId) =>
    get(`/submissions/by-activity/${encodeURIComponent(activityId)}`),

  // Classes
  getStats: () => get("/admin/stats"),
  listClasses: () => get("/admin/classes"),
  createClass: (name, code, semester) => postJSON("/admin/classes", { name, code, semester }),
  updateClass: (id, payload) => patchJSON(`/admin/classes/${encodeURIComponent(id)}`, payload),
  deleteClass: (id) => del(`/admin/classes/${encodeURIComponent(id)}`),
  listClassStudents: (id) => get(`/admin/classes/${encodeURIComponent(id)}/students`),
  addClassStudent: (id, student) => postJSON(`/admin/classes/${encodeURIComponent(id)}/students`, student),
  bulkAddClassStudents: (id, students) => postJSON(`/admin/classes/${encodeURIComponent(id)}/students/bulk`, { students }),
  removeClassStudent: (id, email) => del(`/admin/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(email)}`),
  generateStudentPassword: (id, email) =>
    postJSON(`/admin/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(email)}/password`, {}),
  studentPasswordStatus: (id, email) =>
    get(`/admin/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(email)}/password-status`),
  exportGlobalRoster: () => get("/admin/classes/admin/global-roster"),

  // Allowlist
  listAllowlist: () => get("/admin/allowlist"),
  addAllowlist: (email, note) => postJSON("/admin/allowlist", { email, note }),
  removeAllowlist: (email) =>
    del(`/admin/allowlist/${encodeURIComponent(email)}`),

  // Instructors (Superadmin only)
  listInstructors: () => get("/admin/instructors"),
  addInstructor: (email, role) => postJSON("/admin/instructors", { email, role }),
  removeInstructor: (email) =>
    del(`/admin/instructors/${encodeURIComponent(email)}`),
};
