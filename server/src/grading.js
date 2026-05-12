// Shared correctness check for student answers. Returns true / false
// (auto-graded) or null (ungraded — type doesn't support grading or no
// correct answer was set when the activity was created).
//
// `activity` is the raw activity row (with correct_answer as a JSON string).
// `answer` is one of:
//   { poll_indices: [n, ...] }   for poll / poll_pie / poll_multi
//   { submission: "0,2,1,3" }    for ordering
//
// Used by activities.js (POST /:id/vote), submissions.js (POST /),
// classes.js (detail + stats + export).

export function gradeAnswer(activity, answer) {
  const correct = activity.correct_answer ? JSON.parse(activity.correct_answer) : null;
  const opts = activity.poll_options ? JSON.parse(activity.poll_options) : null;

  if (activity.type === "poll" || activity.type === "poll_pie") {
    if (!correct || correct.index == null) return null;
    if (!answer || !Array.isArray(answer.poll_indices)) return null;
    return answer.poll_indices.length === 1 && answer.poll_indices[0] === correct.index;
  }

  if (activity.type === "poll_multi") {
    if (!correct || !Array.isArray(correct.indices)) return null;
    if (!answer || !Array.isArray(answer.poll_indices)) return null;
    const a = new Set(correct.indices), b = new Set(answer.poll_indices);
    return a.size === b.size && [...a].every(x => b.has(x));
  }

  if (activity.type === "ordering") {
    if (!opts || !answer || answer.submission == null) return null;
    const canonical = opts.map((_, i) => String(i)).join(",");
    return answer.submission.trim() === canonical;
  }

  // word_cloud, submission — never auto-graded.
  return null;
}

// Pull the correct answer out of an activity into a client-friendly shape.
// Returns the parsed object, or null. For ordering, returns a synthetic
// {indices: [0,1,2,...,N-1]} so the client can render canonical order.
export function exposeCorrectAnswer(activity) {
  if (activity.type === "ordering") {
    if (!activity.poll_options) return null;
    const opts = JSON.parse(activity.poll_options);
    return { indices: opts.map((_, i) => i) };
  }
  if (!activity.correct_answer) return null;
  try { return JSON.parse(activity.correct_answer); }
  catch { return null; }
}

// Decide whether to actually disclose the canonical correct answer to
// the student RIGHT NOW. Two cases reveal it:
//   - they got it right (no point hiding it then)
//   - they're out of attempts (lesson is over)
// Anything else, return null — otherwise a multi-attempt cap is
// useless because the first wrong attempt leaks the right answer.
export function shouldRevealCorrect(activity, isCorrect, attemptsUsed) {
  if (isCorrect === true) return true;
  const cap = activity.max_attempts;
  if (cap == null || cap <= 0) return false;   // unlimited → never reveal until correct
  return attemptsUsed >= cap;
}

