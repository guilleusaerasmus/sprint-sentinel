const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  analyseSprint,
  issueFindings,
  assigneeLoad,
  blockedIssues,
  statusBreakdown,
  daysBetween,
  DEFAULTS,
} = require('../src/lib/analysis');

const NOW = new Date('2026-11-10T12:00:00Z');

// Minimal issue factory with sane defaults.
function issue(over = {}) {
  return {
    key: 'ABC-1',
    summary: 'Something',
    status: 'To Do',
    statusCategory: 'new',
    assignee: 'Alice',
    updated: '2026-11-10T11:00:00Z',
    created: '2026-11-01T09:00:00Z',
    dueDate: null,
    flagged: false,
    blockedBy: [],
    storyPoints: null,
    commentCount: 0,
    priority: 'Medium',
    labels: [],
    url: 'https://x.atlassian.net/browse/ABC-1',
    ...over,
  };
}

test('daysBetween counts whole calendar days', () => {
  assert.equal(daysBetween('2026-11-10T12:00:00Z', '2026-11-07T12:00:00Z'), 3);
  assert.equal(daysBetween('2026-11-10T00:00:00Z', '2026-11-10T23:00:00Z'), -1);
  assert.equal(daysBetween('bad', '2026-11-10T00:00:00Z'), null);
});

test('done issues never produce findings', () => {
  const f = issueFindings(
    issue({ statusCategory: 'done', status: 'Done', flagged: true, dueDate: '2026-01-01', commentCount: 50 }),
    NOW,
    DEFAULTS,
  );
  assert.deepEqual(f, []);
});

test('stale in-progress issue is flagged with the real idle days', () => {
  const f = issueFindings(
    issue({ status: 'In Progress', statusCategory: 'indeterminate', updated: '2026-11-05T12:00:00Z' }),
    NOW,
    DEFAULTS,
  );
  const stale = f.find((x) => x.type === 'stale');
  assert.ok(stale, 'expected a stale finding');
  assert.equal(stale.severity, 'medium');
  assert.match(stale.reason, /5 days/);
});

test('fresh in-progress issue is not stale', () => {
  const f = issueFindings(
    issue({ status: 'In Progress', statusCategory: 'indeterminate', updated: '2026-11-10T06:00:00Z' }),
    NOW,
    DEFAULTS,
  );
  assert.equal(f.find((x) => x.type === 'stale'), undefined);
});

test('blocked by flag and by link both fire, at high severity', () => {
  const byFlag = issueFindings(issue({ flagged: true }), NOW, DEFAULTS);
  assert.equal(byFlag.filter((x) => x.type === 'blocked' && x.severity === 'high').length, 1);

  const byLink = issueFindings(issue({ blockedBy: ['ABC-9', 'ABC-8'] }), NOW, DEFAULTS);
  const bl = byLink.find((x) => x.type === 'blocked');
  assert.match(bl.reason, /ABC-9, ABC-8/);
});

test('overdue open issue is high severity with days past', () => {
  const f = issueFindings(issue({ dueDate: '2026-11-07', statusCategory: 'indeterminate', status: 'In Progress', updated: NOW.toISOString() }), NOW, DEFAULTS);
  const od = f.find((x) => x.type === 'overdue');
  assert.ok(od);
  assert.equal(od.severity, 'high');
  assert.match(od.reason, /3 days ago/); // Nov 10 vs due Nov 7
});

test('not-started issue due soon is a low-severity nudge, not overdue', () => {
  const f = issueFindings(issue({ dueDate: '2026-11-11', statusCategory: 'new', status: 'To Do' }), NOW, DEFAULTS);
  assert.equal(f.find((x) => x.type === 'overdue'), undefined);
  const soon = f.find((x) => x.type === 'due-soon');
  assert.ok(soon);
  assert.equal(soon.severity, 'low');
});

test('unassigned in-progress work is flagged', () => {
  const f = issueFindings(issue({ statusCategory: 'indeterminate', status: 'In Progress', assignee: null, updated: NOW.toISOString() }), NOW, DEFAULTS);
  assert.ok(f.find((x) => x.type === 'unassigned'));
});

test('churn fires only past the comment threshold', () => {
  const below = issueFindings(issue({ commentCount: 7 }), NOW, DEFAULTS);
  assert.equal(below.find((x) => x.type === 'churn'), undefined);
  const at = issueFindings(issue({ commentCount: 8, status: 'In Review' }), NOW, DEFAULTS);
  const churn = at.find((x) => x.type === 'churn');
  assert.ok(churn);
  assert.match(churn.reason, /8 comments/);
});

test('assigneeLoad flags only people over the WIP limit', () => {
  const issues = [
    issue({ key: 'A-1', assignee: 'Bob', statusCategory: 'indeterminate', storyPoints: 3 }),
    issue({ key: 'A-2', assignee: 'Bob', statusCategory: 'indeterminate', storyPoints: 2 }),
    issue({ key: 'A-3', assignee: 'Bob', statusCategory: 'indeterminate', storyPoints: 1 }),
    issue({ key: 'A-4', assignee: 'Bob', statusCategory: 'indeterminate', storyPoints: 1 }),
    issue({ key: 'A-5', assignee: 'Sue', statusCategory: 'indeterminate' }),
    issue({ key: 'A-6', assignee: null, statusCategory: 'indeterminate' }),
    issue({ key: 'A-7', assignee: 'Sue', statusCategory: 'done' }),
  ];
  const load = assigneeLoad(issues, DEFAULTS);
  const bob = load.find((r) => r.assignee === 'Bob');
  assert.equal(bob.inProgress, 4);
  assert.equal(bob.storyPoints, 7);
  assert.equal(bob.overloaded, true);
  const sue = load.find((r) => r.assignee === 'Sue');
  assert.equal(sue.inProgress, 1); // the done one is excluded
  assert.equal(sue.overloaded, false);
  const unassigned = load.find((r) => r.assignee === 'Unassigned');
  assert.equal(unassigned.overloaded, false); // never flag the unassigned bucket
});

test('statusBreakdown counts each category', () => {
  const issues = [
    issue({ statusCategory: 'new' }),
    issue({ statusCategory: 'indeterminate' }),
    issue({ statusCategory: 'indeterminate' }),
    issue({ statusCategory: 'done' }),
  ];
  assert.deepEqual(statusBreakdown(issues), { toDo: 1, inProgress: 2, done: 1, total: 4 });
});

test('blockedIssues lists flagged and link-blocked open issues only', () => {
  const issues = [
    issue({ key: 'B-1', flagged: true }),
    issue({ key: 'B-2', blockedBy: ['B-9'] }),
    issue({ key: 'B-3' }),
    issue({ key: 'B-4', flagged: true, statusCategory: 'done' }),
  ];
  const b = blockedIssues(issues);
  assert.deepEqual(b.map((x) => x.key).sort(), ['B-1', 'B-2']);
});

test('analyseSprint produces a coherent, sorted report', () => {
  const issues = [
    issue({ key: 'S-1', status: 'In Progress', statusCategory: 'indeterminate', flagged: true, updated: NOW.toISOString() }),
    issue({ key: 'S-2', status: 'In Progress', statusCategory: 'indeterminate', updated: '2026-11-04T12:00:00Z' }),
    issue({ key: 'S-3', status: 'Done', statusCategory: 'done' }),
    issue({ key: 'S-4', status: 'To Do', statusCategory: 'new' }),
  ];
  const r = analyseSprint(issues, { now: NOW });
  assert.equal(r.summary.total, 4);
  assert.equal(r.summary.done, 1);
  assert.equal(r.summary.completionPercent, 25);
  assert.equal(r.summary.atRiskIssues, 2); // S-1 (blocked) and S-2 (stale)
  // High-severity findings sort first.
  assert.equal(r.findings[0].severity, 'high');
  assert.equal(r.findings[0].key, 'S-1');
  assert.ok(r.generatedAt);
});

test('empty input is handled safely', () => {
  const r = analyseSprint([], { now: NOW });
  assert.equal(r.summary.total, 0);
  assert.equal(r.summary.completionPercent, 0);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.load, []);
});
