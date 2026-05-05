import { api } from "/js/api.js";

const $ = (id) => document.getElementById(id);

function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? ` ${kind}` : "");
}

function showActivity({ activity_id, prompt }) {
  $("activity-id").value = activity_id;
  $("prompt-text").textContent = prompt;
  hide("loading");
  hide("picker");
  show("form-card");
}

function showPicker(activities) {
  hide("loading");
  const list = $("picker-list");
  list.innerHTML = "";
  activities.forEach((a) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = a.prompt;
    const btn = document.createElement("button");
    btn.textContent = "Choose";
    btn.addEventListener("click", () => showActivity(a));
    li.append(span, btn);
    list.appendChild(li);
  });
  show("picker");
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get("activity");
  try {
    if (id) {
      const res = await api.getActivity(id);
      if (!res.ok) throw new Error(res.error || "Activity not found");
      showActivity(res.activity);
    } else {
      const res = await api.listOpenActivities();
      if (!res.ok) throw new Error(res.error || "Failed to load");
      if (!res.activities.length) {
        hide("loading");
        show("empty");
        return;
      }
      if (res.activities.length === 1) showActivity(res.activities[0]);
      else showPicker(res.activities);
    }
  } catch (err) {
    hide("loading");
    show("form-card");
    setStatus(`Could not load activities: ${err.message}`, "error");
  }
}

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("submit-btn");
  btn.disabled = true;
  setStatus("Submitting…");
  try {
    const res = await api.submit({
      activity_id: $("activity-id").value,
      student_id: $("student-id").value.trim(),
      response: $("response").value.trim(),
    });
    if (res.ok) {
      setStatus("Submitted. Thanks!", "success");
    } else {
      setStatus(res.error || "Submission rejected.", "error");
      btn.disabled = false;
    }
  } catch (err) {
    setStatus(`Network error: ${err.message}`, "error");
    btn.disabled = false;
  }
});

init();
