// Sprint Sentinel — Forge action handlers.
//
// Each handler is exposed twice in the manifest: once as a Rovo agent action
// and once as an MCP tool. They fetch the active sprint for a board, run the
// unit-tested analysis in src/lib/analysis.js, and return both a pre-formatted
// `text` block (so the agent relays exact, cited facts) and the raw `data`.

const { loadSprint } = require('./lib/jira');
const { analyseSprint, forecastSprint } = require('./lib/analysis');

function readThresholds(payload) {
  const opts = {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  if (payload.staleDays !== undefined) opts.staleDays = num(payload.staleDays);
  if (payload.wipLimit !== undefined) opts.wipLimit = num(payload.wipLimit);
  if (payload.churnComments !== undefined) opts.churnComments = num(payload.churnComments);
  if (payload.dueSoonDays !== undefined) opts.dueSoonDays = num(payload.dueSoonDays);
  // Drop undefined so defaults apply.
  Object.keys(opts).forEach((k) => opts[k] === undefined && delete opts[k]);
  return opts;
}

function requireBoardId(payload) {
  const boardId = payload && (payload.boardId ?? payload.board ?? payload.board_id);
  if (boardId === undefined || boardId === null || `${boardId}`.trim() === '') {
    const err = new Error('Please provide the Jira board id (a number you can see in the board URL as rapidView= or ?boardId=).');
    err.userFacing = true;
    throw err;
  }
  return `${boardId}`.trim();
}

async function withSprint(payload, build) {
  let boardId;
  try {
    boardId = requireBoardId(payload);
  } catch (e) {
    return { text: e.message, data: { error: e.message } };
  }
  try {
    const { sprint, issues } = await loadSprint(boardId);
    if (!sprint) {
      const msg = `No active sprint was found for board ${boardId}. Start a sprint, or check the board id.`;
      return { text: msg, data: { boardId, activeSprint: null } };
    }
    const report = analyseSprint(issues, { now: new Date(), options: readThresholds(payload) });
    report.forecast = forecastSprint(report, sprint, new Date());
    return build({ boardId, sprint, report });
  } catch (e) {
    const msg = e.userFacing ? e.message : `Could not analyse board ${boardId}: ${e.message}`;
    return { text: msg, data: { error: msg } };
  }
}

function sprintLine(sprint) {
  const dates = sprint.endDate ? ` (ends ${sprint.endDate.slice(0, 10)})` : '';
  return `Sprint "${sprint.name}"${dates}`;
}

function fmtFinding(f) {
  return `- [${f.severity.toUpperCase()}] ${f.key} — ${f.reason} (${f.summary})`;
}

// 1) Overall sprint health.
const sprintHealth = async (payload) =>
  withSprint(payload, ({ sprint, report }) => {
    const s = report.summary;
    const f = report.forecast;
    const top = report.findings.slice(0, 8).map(fmtFinding);
    const overloaded = report.load.filter((r) => r.overloaded).map((r) => `${r.assignee} (${r.inProgress} in progress)`);
    const forecastLine = f.projectedCompletionPercent != null
      ? `Confidence: ${f.confidence.toUpperCase()} — projected ${f.projectedCompletionPercent}% of issues done by the end date. ${f.drivers[0]}`
      : `Confidence: ${f.confidence.toUpperCase()} — ${f.drivers[0]}`;
    const lines = [
      `${sprintLine(sprint)} — health report`,
      forecastLine,
      `Progress: ${s.done}/${s.total} done (${s.completionPercent}%); ${s.inProgress} in progress, ${s.toDo} to do.`,
      `At risk: ${s.atRiskIssues} issue(s) — ${s.findingsBySeverity.high} high, ${s.findingsBySeverity.medium} medium, ${s.findingsBySeverity.low} low.`,
      overloaded.length ? `Overloaded: ${overloaded.join('; ')}.` : 'No one is over the WIP limit.',
      report.blocked.length ? `Blocked: ${report.blocked.map((b) => b.key).join(', ')}.` : 'Nothing is blocked.',
      '',
      top.length ? 'Top risks:' : 'No risks detected.',
      ...top,
    ];
    return { text: lines.join('\n'), data: { sprint, summary: s, forecast: f, topFindings: report.findings.slice(0, 8) } };
  });

// 2) The at-risk issues, optionally filtered by severity.
const atRiskIssues = async (payload) =>
  withSprint(payload, ({ sprint, report }) => {
    const wanted = payload.severity ? `${payload.severity}`.toLowerCase() : null;
    let findings = report.findings;
    if (wanted && ['high', 'medium', 'low'].includes(wanted)) findings = findings.filter((f) => f.severity === wanted);
    const lines = [
      `${sprintLine(sprint)} — ${findings.length} risk finding(s)${wanted ? ` at ${wanted} severity` : ''}:`,
      ...findings.map(fmtFinding),
    ];
    return { text: findings.length ? lines.join('\n') : `${sprintLine(sprint)} — no risks${wanted ? ` at ${wanted} severity` : ''}.`, data: { findings } };
  });

// 3) Per-assignee work-in-progress load.
const assigneeLoad = async (payload) =>
  withSprint(payload, ({ sprint, report }) => {
    const rows = report.load.map(
      (r) => `- ${r.assignee}: ${r.inProgress} in progress${r.storyPoints ? `, ${r.storyPoints} pts` : ''}${r.overloaded ? ' — OVER WIP LIMIT' : ''} [${r.issues.join(', ')}]`,
    );
    return {
      text: [`${sprintLine(sprint)} — work in progress by person:`, ...(rows.length ? rows : ['Nobody has work in progress.'])].join('\n'),
      data: { load: report.load, wipLimit: report.thresholds.wipLimit },
    };
  });

// 4) Blocked issues and their blockers.
const blockedIssues = async (payload) =>
  withSprint(payload, ({ sprint, report }) => {
    const rows = report.blocked.map((b) => {
      const why = b.flagged ? 'flagged as an impediment' : '';
      const links = b.blockedBy.length ? `blocked by ${b.blockedBy.join(', ')}` : '';
      const reason = [why, links].filter(Boolean).join('; ');
      return `- ${b.key} — ${reason} (${b.summary})${b.assignee ? `, assignee ${b.assignee}` : ''}`;
    });
    return {
      text: [`${sprintLine(sprint)} — ${report.blocked.length} blocked issue(s):`, ...(rows.length ? rows : ['Nothing is blocked.'])].join('\n'),
      data: { blocked: report.blocked },
    };
  });

module.exports = { sprintHealth, atRiskIssues, assigneeLoad, blockedIssues };
