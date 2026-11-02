// Thin Jira I/O layer for Sprint Sentinel.
//
// Fetches the active sprint and its issues through the Jira Agile + Platform
// REST APIs and normalises each issue into the shape that src/lib/analysis.js
// expects. The only logic here is field discovery and normalisation; all the
// sprint-health reasoning lives in analysis.js, where it is unit-tested.

const api = require('@forge/api');

const { route } = api;

// Jira stores Story Points and the impediment Flag as per-site custom fields,
// so discover their ids once by name rather than hard-coding a customfield_xxxxx.
let fieldCache = null;

async function discoverFields() {
  if (fieldCache) return fieldCache;
  const res = await api.asUser().requestJira(route`/rest/api/3/field`);
  if (!res.ok) {
    // Non-fatal: fall back to no custom fields.
    fieldCache = { storyPoints: null, flagged: null };
    return fieldCache;
  }
  const fields = await res.json();
  const byName = (re) => {
    const f = fields.find((x) => typeof x.name === 'string' && re.test(x.name));
    return f ? f.id : null;
  };
  const allByName = (re) => fields.filter((x) => typeof x.name === 'string' && re.test(x.name)).map((x) => x.id);
  fieldCache = {
    // A site can expose more than one story-point field ("Story Points" in
    // company-managed projects, "Story point estimate" in team-managed ones).
    // Keep every candidate; normaliseIssue uses whichever one holds a value.
    storyPoints: allByName(/^story point/i),
    flagged: byName(/^flagged$/i),
  };
  return fieldCache;
}

async function getActiveSprint(boardId) {
  const res = await api
    .asUser()
    .requestJira(route`/rest/agile/1.0/board/${boardId}/sprint?state=active`);
  if (!res.ok) {
    throw new Error(`Could not read sprints for board ${boardId} (HTTP ${res.status}).`);
  }
  const body = await res.json();
  const sprint = (body.values || [])[0];
  if (!sprint) return null;
  return { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal || null };
}

// Fetch every issue in a sprint, following pagination.
async function getSprintIssues(sprintId, fieldIds) {
  const wanted = [
    'summary',
    'status',
    'assignee',
    'updated',
    'created',
    'duedate',
    'priority',
    'labels',
    'issuelinks',
    'comment',
  ];
  for (const id of fieldIds.storyPoints || []) wanted.push(id);
  if (fieldIds.flagged) wanted.push(fieldIds.flagged);
  const fieldsParam = wanted.join(',');

  const issues = [];
  let startAt = 0;
  const pageSize = 50;
  // Cap total pages so a huge sprint can't run away with the request budget.
  for (let page = 0; page < 20; page += 1) {
    const res = await api
      .asUser()
      .requestJira(
        route`/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${pageSize}&fields=${fieldsParam}`,
      );
    if (!res.ok) throw new Error(`Could not read issues for sprint ${sprintId} (HTTP ${res.status}).`);
    const body = await res.json();
    const batch = body.issues || [];
    for (const raw of batch) issues.push(raw);
    if (startAt + batch.length >= (body.total || 0) || batch.length === 0) break;
    startAt += batch.length;
  }
  return issues;
}

const DONE = 'done';

function normaliseIssue(raw, fieldIds, browseBase) {
  const f = raw.fields || {};
  const statusCategoryKey = (((f.status || {}).statusCategory || {}).key || 'new').toLowerCase();
  // Jira category keys: 'new' (to do), 'indeterminate' (in progress), 'done'.
  const statusCategory = statusCategoryKey === 'done' ? 'done' : statusCategoryKey === 'indeterminate' ? 'indeterminate' : 'new';

  const blockedBy = [];
  for (const link of f.issuelinks || []) {
    const inward = (link.type || {}).inward || '';
    // Jira returns, on the blocked issue, the blocker as the link's outwardIssue
    // (the end whose relationship is "blocks"); the inwardIssue field is the
    // current issue and is omitted. So read outwardIssue as the blocker.
    if (/is blocked by/i.test(inward) && link.outwardIssue) {
      const linkedDone = ((((link.outwardIssue.fields || {}).status || {}).statusCategory || {}).key || '') === DONE;
      if (!linkedDone) blockedBy.push(link.outwardIssue.key);
    }
  }

  let flagged = false;
  if (fieldIds.flagged && Array.isArray(f[fieldIds.flagged])) {
    flagged = f[fieldIds.flagged].length > 0; // "Flagged" is a checkbox-list field
  }

  let storyPoints = null;
  for (const id of fieldIds.storyPoints || []) {
    if (typeof f[id] === 'number') {
      storyPoints = f[id];
      break;
    }
  }

  return {
    key: raw.key,
    summary: f.summary || '',
    status: (f.status || {}).name || 'Unknown',
    statusCategory,
    assignee: f.assignee ? f.assignee.displayName : null,
    updated: f.updated || null,
    created: f.created || null,
    dueDate: f.duedate || null,
    flagged,
    blockedBy,
    storyPoints,
    commentCount: (f.comment || {}).total || 0,
    priority: (f.priority || {}).name || null,
    labels: Array.isArray(f.labels) ? f.labels : [],
    url: browseBase ? `${browseBase}/browse/${raw.key}` : null,
  };
}

// Resolve the site base URL for building browse links (best-effort).
async function getBrowseBase() {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
    if (res.ok) {
      const info = await res.json();
      if (info.baseUrl) return info.baseUrl.replace(/\/$/, '');
    }
  } catch (_) {
    /* ignore — links are a nicety, not required */
  }
  return null;
}

// High-level helper: return normalised issues + sprint meta for a board.
async function loadSprint(boardId) {
  const fieldIds = await discoverFields();
  const sprint = await getActiveSprint(boardId);
  if (!sprint) return { sprint: null, issues: [] };
  const [rawIssues, browseBase] = await Promise.all([getSprintIssues(sprint.id, fieldIds), getBrowseBase()]);
  const issues = rawIssues.map((r) => normaliseIssue(r, fieldIds, browseBase));
  return { sprint, issues };
}

module.exports = {
  loadSprint,
  normaliseIssue,
  discoverFields,
  getActiveSprint,
  getSprintIssues,
  _resetFieldCache: () => {
    fieldCache = null;
  },
};
