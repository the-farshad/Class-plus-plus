// Single source of truth for backend access.
// After deploying apps-script/Code.gs as a Web App, paste the URL below.
export const WEB_APP_URL = "https://script.google.com/macros/s/REPLACE_ME/exec";

async function getJSON(params) {
  const url = new URL(WEB_APP_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJSON(body) {
  // text/plain avoids a CORS preflight against Apps Script.
  const res = await fetch(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  listOpenActivities: () => getJSON({ action: "activities" }),
  getActivity: (id) => getJSON({ action: "activity", id }),
  submit: ({ activity_id, student_id, response }) =>
    postJSON({ action: "submit", activity_id, student_id, response }),
  listSubmissions: ({ activity_id, token }) =>
    getJSON({ action: "submissions", activity_id, token }),
  listAllActivities: ({ token }) =>
    getJSON({ action: "all_activities", token }),
  createActivity: ({ prompt, token }) =>
    postJSON({ action: "create_activity", prompt, token }),
  setStatus: ({ activity_id, status, token }) =>
    postJSON({ action: "set_status", activity_id, status, token }),
};
