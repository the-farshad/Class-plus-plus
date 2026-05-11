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

export const api = {
  // Theme Management
  initTheme: () => {
    const saved = localStorage.getItem("classpp.theme");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = saved || system;
    document.documentElement.setAttribute("data-theme", theme);
  },
  toggleTheme: () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("classpp.theme", next);
    return next;
  },

  // Auth / config
  authConfig: () => get("/auth/config"),
  signIn: async (idToken) => {
    const res = await postJSON("/auth/google", { id_token: idToken });
    if (res.ok) session.set(res.token, res.user);
    return res;
  },
  signOut: () => session.clear(),

  // Activities
  listOpenActivities: (classId) => get(`/activities${classId ? `?class_id=${classId}` : ""}`),
  getActivity: (id) => get(`/activities/${encodeURIComponent(id)}`),
  listAllActivities: (classId) => get(`/activities/admin/all${classId ? `?class_id=${classId}` : ""}`),
  createActivity: (prompt, classId, type, options) =>
    postJSON("/activities/admin", { prompt, class_id: classId, type, poll_options: options }),
  setActivityStatus: (id, status) =>
    patchJSON(`/activities/admin/${encodeURIComponent(id)}`, { status }),
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
  deleteClass: (id) => del(`/admin/classes/${encodeURIComponent(id)}`),
  listClassStudents: (id) => get(`/admin/classes/${encodeURIComponent(id)}/students`),
  addClassStudent: (id, student) => postJSON(`/admin/classes/${encodeURIComponent(id)}/students`, student),
  bulkAddClassStudents: (id, students) => postJSON(`/admin/classes/${encodeURIComponent(id)}/students/bulk`, { students }),
  removeClassStudent: (id, email) => del(`/admin/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(email)}`),

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
