// Tests for the Jira normalisation layer (src/lib/jira.js).
//
// These lock down normaliseIssue against the REAL shape the Jira REST API
// returns, verified live against a Jira Cloud site:
//  - On a blocked issue, the blocker arrives as the link's `outwardIssue`
//    (the "blocks" end); the inward side is the issue itself and is omitted.
//  - The "Flagged" field is a checkbox-option array; non-empty means flagged.

const { test } = require('node:test');
const assert = require('node:assert');

const { normaliseIssue } = require('../src/lib/jira');

const FIELD_IDS = { storyPoints: ['customfield_10031', 'customfield_10016'], flagged: 'customfield_10021' };

function raw(fields) {
  return { key: 'SHOP-1', fields };
}

test('normaliseIssue: issue "is blocked by" an open issue picks the blocker from outwardIssue', () => {
  const issue = normaliseIssue(
    raw({
      summary: 'Add Apple Pay',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      issuelinks: [
        {
          type: { inward: 'is blocked by', outward: 'blocks' },
          outwardIssue: { key: 'SHOP-6', fields: { status: { statusCategory: { key: 'new' } } } },
        },
      ],
    }),
    FIELD_IDS,
    null,
  );
  assert.deepStrictEqual(issue.blockedBy, ['SHOP-6']);
});

test('normaliseIssue: a blocker that is already Done is ignored', () => {
  const issue = normaliseIssue(
    raw({
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      issuelinks: [
        {
          type: { inward: 'is blocked by', outward: 'blocks' },
          outwardIssue: { key: 'SHOP-9', fields: { status: { statusCategory: { key: 'done' } } } },
        },
      ],
    }),
    FIELD_IDS,
    null,
  );
  assert.deepStrictEqual(issue.blockedBy, []);
});

test('normaliseIssue: an issue that BLOCKS another (inwardIssue) is not itself blocked', () => {
  const issue = normaliseIssue(
    raw({
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      issuelinks: [
        {
          type: { inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: { key: 'SHOP-3', fields: { status: { statusCategory: { key: 'new' } } } },
        },
      ],
    }),
    FIELD_IDS,
    null,
  );
  assert.deepStrictEqual(issue.blockedBy, []);
});

test('normaliseIssue: Flagged field with an option marks the issue flagged', () => {
  const issue = normaliseIssue(
    raw({
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10021: [{ value: 'Impediment' }],
    }),
    FIELD_IDS,
    null,
  );
  assert.strictEqual(issue.flagged, true);
});

test('normaliseIssue: no flag field means not flagged', () => {
  const issue = normaliseIssue(
    raw({ status: { name: 'To Do', statusCategory: { key: 'new' } } }),
    FIELD_IDS,
    null,
  );
  assert.strictEqual(issue.flagged, false);
});

test('normaliseIssue: story points are read from whichever candidate field holds a value', () => {
  // The first candidate (customfield_10031) is absent; the value lives in the
  // second (customfield_10016) — as on a team-managed board.
  const issue = normaliseIssue(
    raw({
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10016: 8,
    }),
    FIELD_IDS,
    null,
  );
  assert.strictEqual(issue.storyPoints, 8);
});

test('normaliseIssue: status category maps to the three buckets', () => {
  const done = normaliseIssue(raw({ status: { name: 'Done', statusCategory: { key: 'done' } } }), FIELD_IDS, null);
  const prog = normaliseIssue(raw({ status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } }), FIELD_IDS, null);
  const todo = normaliseIssue(raw({ status: { name: 'To Do', statusCategory: { key: 'new' } } }), FIELD_IDS, null);
  assert.strictEqual(done.statusCategory, 'done');
  assert.strictEqual(prog.statusCategory, 'indeterminate');
  assert.strictEqual(todo.statusCategory, 'new');
});
