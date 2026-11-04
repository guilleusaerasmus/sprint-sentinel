// Sprint Sentinel — core sprint-health analysis.
//
// Pure, dependency-free functions so every number the Rovo agent reports is
// computed here (and unit-tested) rather than invented by the language model.
// The Forge functions in src/index.js fetch Jira data, normalise it to the
// shape documented below, and pass it straight into these functions.
//
// Normalised issue shape (see src/lib/jira.js -> normaliseIssue):
// {
//   key: 'ABC-1',
//   summary: string,
//   status: string,                 // e.g. 'In Progress'
//   statusCategory: 'new'|'indeterminate'|'done',
//   assignee: string | null,        // display name
//   updated: string,                // ISO 8601
//   created: string,                // ISO 8601
//   dueDate: string | null,         // 'YYYY-MM-DD'
//   flagged: boolean,               // Jira impediment flag
//   blockedBy: string[],            // keys of unresolved "is blocked by" links
//   storyPoints: number | null,
//   commentCount: number,
//   priority: string | null,
//   labels: string[],
//   url: string | null              // browser URL for the issue
// }

const DEFAULTS = Object.freeze({
  staleDays: 3, // in-progress issue untouched for this many days -> stale
  dueSoonDays: 2, // not-started issue due within this many days -> due soon
  churnComments: 8, // this many comments while still unfinished -> churn
  wipLimit: 3, // more than this many in-progress issues per person -> overloaded
});

const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });

function toDate(value) {
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Whole calendar days between two instants (a - b), floored.
function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

function isDone(issue) {
  return issue.statusCategory === 'done';
}

function isInProgress(issue) {
  return issue.statusCategory === 'indeterminate';
}

function isNotStarted(issue) {
  return issue.statusCategory === 'new';
}

// Build the list of risk findings for a single issue. Each finding names the
// issue, the concrete evidence, and a severity. No finding is emitted without
// evidence drawn from the issue's own fields.
function issueFindings(issue, now, opts) {
  const findings = [];
  const add = (type, severity, reason) =>
    findings.push({ key: issue.key, summary: issue.summary, type, severity, reason, url: issue.url || null });

  if (isDone(issue)) return findings; // finished work carries no sprint risk

  // Blocked: flagged as an impediment, or linked "is blocked by" an open issue.
  if (issue.flagged) {
    add('blocked', 'high', 'Flagged as an impediment.');
  }
  if (Array.isArray(issue.blockedBy) && issue.blockedBy.length > 0) {
    add('blocked', 'high', `Blocked by ${issue.blockedBy.join(', ')}.`);
  }

  // Overdue: due date is in the past and the issue is not done.
  // Compare calendar dates (UTC) so "Nov 10 vs due Nov 7" reads as 3 days.
  if (issue.dueDate) {
    const todayYmd = toDate(now) ? toDate(now).toISOString().slice(0, 10) : null;
    const overdueBy = todayYmd ? daysBetween(`${todayYmd}T00:00:00Z`, `${issue.dueDate}T00:00:00Z`) : null;
    if (overdueBy !== null && overdueBy > 0) {
      add('overdue', 'high', `Due date ${issue.dueDate} has passed (${overdueBy} day${overdueBy === 1 ? '' : 's'} ago).`);
    } else if (overdueBy !== null && overdueBy <= 0 && isNotStarted(issue)) {
      const dueIn = -overdueBy;
      if (dueIn <= opts.dueSoonDays) {
        const when = dueIn === 0 ? 'Due today' : `Due in ${dueIn} day${dueIn === 1 ? '' : 's'}`;
        add('due-soon', 'low', `${when} (${issue.dueDate}) but not started.`);
      }
    }
  }

  // Stale: in progress but untouched for too long.
  if (isInProgress(issue)) {
    const idle = daysBetween(now, issue.updated);
    if (idle !== null && idle >= opts.staleDays) {
      add('stale', 'medium', `In progress but not updated in ${idle} day${idle === 1 ? '' : 's'}.`);
    }
    // Unassigned work in progress.
    if (!issue.assignee) {
      add('unassigned', 'medium', 'In progress with no assignee.');
    }
  }

  // Churn: lots of discussion but the work is still not finished.
  if (typeof issue.commentCount === 'number' && issue.commentCount >= opts.churnComments) {
    add('churn', 'low', `${issue.commentCount} comments but still ${issue.status}.`);
  }

  return findings;
}

// Rank findings: by severity, then by the most urgent reason within a severity.
function compareFindings(a, b) {
  const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (s !== 0) return s;
  return a.key.localeCompare(b.key, undefined, { numeric: true });
}

// Per-assignee work-in-progress load.
function assigneeLoad(issues, opts) {
  const byPerson = new Map();
  for (const issue of issues) {
    if (!isInProgress(issue)) continue;
    const name = issue.assignee || 'Unassigned';
    if (!byPerson.has(name)) byPerson.set(name, { assignee: name, inProgress: 0, storyPoints: 0, issues: [] });
    const entry = byPerson.get(name);
    entry.inProgress += 1;
    entry.storyPoints += typeof issue.storyPoints === 'number' ? issue.storyPoints : 0;
    entry.issues.push(issue.key);
  }
  const rows = [...byPerson.values()].map((row) => ({
    ...row,
    overloaded: row.assignee !== 'Unassigned' && row.inProgress > opts.wipLimit,
  }));
  rows.sort((a, b) => b.inProgress - a.inProgress || a.assignee.localeCompare(b.assignee));
  return rows;
}

// Blocked issues with their blockers, for the dedicated action/tool.
function blockedIssues(issues) {
  return issues
    .filter((i) => !isDone(i) && (i.flagged || (Array.isArray(i.blockedBy) && i.blockedBy.length > 0)))
    .map((i) => ({
      key: i.key,
      summary: i.summary,
      assignee: i.assignee || null,
      flagged: !!i.flagged,
      blockedBy: Array.isArray(i.blockedBy) ? i.blockedBy : [],
      url: i.url || null,
    }));
}

// Count issues by status category.
function statusBreakdown(issues) {
  const b = { new: 0, indeterminate: 0, done: 0 };
  for (const i of issues) {
    if (i.statusCategory in b) b[i.statusCategory] += 1;
  }
  return { toDo: b.new, inProgress: b.indeterminate, done: b.done, total: issues.length };
}

// Main entry point: a full, evidence-backed sprint health report.
function analyseSprint(issues, { now = new Date(), options = {} } = {}) {
  const opts = { ...DEFAULTS, ...options };
  const list = Array.isArray(issues) ? issues : [];

  const findings = [];
  for (const issue of list) findings.push(...issueFindings(issue, now, opts));
  findings.sort(compareFindings);

  // One issue can trip several rules; count distinct at-risk issues too.
  const atRiskKeys = new Set(findings.map((f) => f.key));

  const breakdown = statusBreakdown(list);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;

  const done = breakdown.done;
  const completion = breakdown.total > 0 ? Math.round((done / breakdown.total) * 100) : 0;

  return {
    generatedAt: toDate(now).toISOString(),
    thresholds: opts,
    summary: {
      ...breakdown,
      completionPercent: completion,
      atRiskIssues: atRiskKeys.size,
      findingsBySeverity: counts,
    },
    findings,
    load: assigneeLoad(list, opts),
    blocked: blockedIssues(list),
  };
}

// Sprint outcome forecast — an auditable "will this sprint land?" read.
//
// This is deliberately a transparent heuristic, not a black-box probability:
// it linearly extrapolates the current completion pace to the sprint end date,
// then adjusts a confidence label for the concrete risks the engine already
// found. Every driver is returned as plain text so the number can be audited.
// Like the rest of this file it is pure and unit-tested; the LLM never computes
// the forecast, it only relays it.
function forecastSprint(report, sprint, now = new Date()) {
  const s = report.summary;
  const workDone = s.total > 0 ? s.done / s.total : 0;

  const start = sprint && sprint.startDate ? toDate(sprint.startDate) : null;
  const end = sprint && sprint.endDate ? toDate(sprint.endDate) : null;
  const nowD = toDate(now);

  let timeElapsed = null; // 0..1 of the sprint window
  let projected = null; // 0..1 projected completion at the end date
  if (start && end && end.getTime() > start.getTime() && nowD) {
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = Math.min(Math.max(nowD.getTime() - start.getTime(), 0), totalMs);
    timeElapsed = elapsedMs / totalMs;
    // Linear pace extrapolation; needs enough of the sprint to have elapsed.
    if (timeElapsed >= 0.05) projected = Math.min(1, workDone / timeElapsed);
  }

  const highRisks = s.findingsBySeverity.high;
  const overloaded = report.load.filter((r) => r.overloaded).length;

  // Confidence label from the projected finish, then downgraded for serious risk.
  const p = projected == null ? workDone : projected;
  let confidence = p >= 0.9 ? 'high' : p >= 0.7 ? 'medium' : 'low';
  if ((highRisks >= 2 || overloaded >= 1) && confidence === 'high') confidence = 'medium';
  if (highRisks >= 3 && confidence === 'medium') confidence = 'low';

  const drivers = [];
  if (timeElapsed != null) {
    drivers.push(`${Math.round(timeElapsed * 100)}% of the sprint has elapsed while ${s.completionPercent}% of issues are done.`);
  } else {
    drivers.push(`Based on current completion only (${s.completionPercent}%); no sprint start/end dates to project a pace.`);
  }
  if (projected != null) {
    drivers.push(`At the current pace, about ${Math.round(projected * 100)}% of committed issues would be done by the end date.`);
  }
  if (highRisks) drivers.push(`${highRisks} high-severity risk${highRisks === 1 ? '' : 's'} (blocked or overdue) threaten delivery.`);
  if (overloaded) drivers.push(`${overloaded} ${overloaded === 1 ? 'person is' : 'people are'} over the WIP limit.`);

  return {
    confidence, // 'high' | 'medium' | 'low'
    projectedCompletionPercent: projected != null ? Math.round(projected * 100) : null,
    drivers,
    basis: { workDoneFraction: workDone, timeElapsedFraction: timeElapsed },
  };
}

module.exports = {
  DEFAULTS,
  analyseSprint,
  forecastSprint,
  issueFindings,
  assigneeLoad,
  blockedIssues,
  statusBreakdown,
  daysBetween,
};
