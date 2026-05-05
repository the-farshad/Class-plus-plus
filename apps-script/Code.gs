/**
 * Class++ backend — single Apps Script Web App fronting one Google Sheet.
 *
 * Tabs (with header row):
 *   Roster        : student_id | name | email | active
 *   Activities    : activity_id | prompt | created_at | status
 *   Submissions   : timestamp | activity_id | student_id | response
 *
 * Script Properties:
 *   INSTRUCTOR_TOKEN  shared secret required for instructor endpoints
 */

const SHEET_ROSTER = 'Roster';
const SHEET_ACTIVITIES = 'Activities';
const SHEET_SUBMISSIONS = 'Submissions';

function doGet(e) {
  return route(e.parameter || {}, null);
}

function doPost(e) {
  let body = {};
  try {
    body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (err) {
    return jsonOut({ ok: false, error: 'Invalid JSON body' });
  }
  return route(body, body);
}

function route(params, body) {
  const action = (params.action || (body && body.action) || '').toString();
  try {
    switch (action) {
      case 'activities':       return jsonOut(handleListOpenActivities());
      case 'activity':         return jsonOut(handleGetActivity(params.id));
      case 'submit':           return jsonOut(handleSubmit(body || {}));
      case 'all_activities':   return jsonOut(requireToken(params, () => handleAllActivities()));
      case 'submissions':      return jsonOut(requireToken(params, () => handleSubmissions(params.activity_id)));
      case 'create_activity':  return jsonOut(requireToken(body, () => handleCreateActivity(body)));
      case 'set_status':       return jsonOut(requireToken(body, () => handleSetStatus(body)));
      default:                 return jsonOut({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// --- Handlers -------------------------------------------------------------

function handleListOpenActivities() {
  const rows = readRows(SHEET_ACTIVITIES);
  const activities = rows
    .filter((r) => String(r.status).toLowerCase() === 'open')
    .map((r) => ({ activity_id: String(r.activity_id), prompt: String(r.prompt) }));
  return { ok: true, activities };
}

function handleGetActivity(id) {
  if (!id) return { ok: false, error: 'Missing activity id' };
  const rows = readRows(SHEET_ACTIVITIES);
  const found = rows.find((r) => String(r.activity_id) === String(id));
  if (!found) return { ok: false, error: 'Activity not found' };
  if (String(found.status).toLowerCase() !== 'open') {
    return { ok: false, error: 'Activity is closed' };
  }
  return {
    ok: true,
    activity: { activity_id: String(found.activity_id), prompt: String(found.prompt) },
  };
}

function handleSubmit(body) {
  const activityId = String(body.activity_id || '').trim();
  const studentId = String(body.student_id || '').trim();
  const response = String(body.response || '').trim();
  if (!activityId || !studentId || !response) {
    return { ok: false, error: 'Missing fields' };
  }

  const activities = readRows(SHEET_ACTIVITIES);
  const activity = activities.find((r) => String(r.activity_id) === activityId);
  if (!activity) return { ok: false, error: 'Activity not found' };
  if (String(activity.status).toLowerCase() !== 'open') {
    return { ok: false, error: 'Activity is closed' };
  }

  const roster = readRows(SHEET_ROSTER);
  const match = roster.find((r) =>
    String(r.student_id).trim().toLowerCase() === studentId.toLowerCase());
  if (!match) return { ok: false, error: 'Identifier not on roster' };
  if (String(match.active).toLowerCase() === 'false') {
    return { ok: false, error: 'Identifier is inactive' };
  }

  const sheet = sheetByName(SHEET_SUBMISSIONS);
  sheet.appendRow([new Date(), activityId, studentId, response]);
  return { ok: true };
}

function handleAllActivities() {
  const rows = readRows(SHEET_ACTIVITIES);
  const activities = rows.map((r) => ({
    activity_id: String(r.activity_id),
    prompt: String(r.prompt),
    created_at: r.created_at instanceof Date
      ? Utilities.formatDate(r.created_at, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.created_at || ''),
    status: String(r.status || 'closed').toLowerCase(),
  }));
  // newest first
  activities.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return { ok: true, activities };
}

function handleSubmissions(activityId) {
  if (!activityId) return { ok: false, error: 'Missing activity id' };
  const rows = readRows(SHEET_SUBMISSIONS);
  const tz = Session.getScriptTimeZone();
  const submissions = rows
    .filter((r) => String(r.activity_id) === String(activityId))
    .map((r) => ({
      timestamp: r.timestamp instanceof Date
        ? Utilities.formatDate(r.timestamp, tz, 'yyyy-MM-dd HH:mm:ss')
        : String(r.timestamp || ''),
      student_id: String(r.student_id),
      response: String(r.response),
    }));
  return { ok: true, submissions };
}

function handleCreateActivity(body) {
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return { ok: false, error: 'Missing prompt' };
  const sheet = sheetByName(SHEET_ACTIVITIES);
  const id = nextActivityId();
  const createdAt = new Date();
  sheet.appendRow([id, prompt, createdAt, 'open']);
  return { ok: true, activity_id: id };
}

function handleSetStatus(body) {
  const id = String(body.activity_id || '').trim();
  const status = String(body.status || '').trim().toLowerCase();
  if (!id || (status !== 'open' && status !== 'closed')) {
    return { ok: false, error: 'Invalid id or status' };
  }
  const sheet = sheetByName(SHEET_ACTIVITIES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('activity_id');
  const statusCol = headers.indexOf('status');
  if (idCol < 0 || statusCol < 0) return { ok: false, error: 'Missing columns' };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === id) {
      sheet.getRange(i + 1, statusCol + 1).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Activity not found' };
}

// --- Helpers --------------------------------------------------------------

function requireToken(obj, fn) {
  const expected = PropertiesService.getScriptProperties().getProperty('INSTRUCTOR_TOKEN');
  const provided = (obj && obj.token) || '';
  if (!expected || provided !== expected) {
    return { ok: false, error: 'Unauthorized' };
  }
  return fn();
}

function sheetByName(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found`);
  return sheet;
}

function readRows(sheetName) {
  const sheet = sheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function nextActivityId() {
  const rows = readRows(SHEET_ACTIVITIES);
  let max = 0;
  rows.forEach((r) => {
    const n = parseInt(String(r.activity_id), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
