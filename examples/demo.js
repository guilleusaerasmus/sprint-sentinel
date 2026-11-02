// Offline demo of the analysis engine — no Jira or Forge needed.
//   node examples/demo.js
// Shows the exact, evidence-backed report the Rovo agent relays. Every line is
// computed by src/lib/analysis.js from the sample issues below.

const { analyseSprint } = require('../src/lib/analysis');

const now = new Date('2026-11-10T09:00:00Z');

const issues = [
  { key: 'SHOP-12', summary: 'Checkout crashes on Safari', status: 'In Progress', statusCategory: 'indeterminate', assignee: 'Alice', updated: '2026-11-04T10:00:00Z', created: '2026-11-01T09:00:00Z', dueDate: '2026-11-08', flagged: false, blockedBy: [], storyPoints: 5, commentCount: 3, priority: 'High', labels: [], url: null },
  { key: 'SHOP-15', summary: 'Add Apple Pay', status: 'In Progress', statusCategory: 'indeterminate', assignee: 'Alice', updated: '2026-11-10T08:00:00Z', created: '2026-11-02T09:00:00Z', dueDate: null, flagged: true, blockedBy: ['SHOP-20'], storyPoints: 8, commentCount: 12, priority: 'High', labels: [], url: null },
  { key: 'SHOP-16', summary: 'Refactor cart state', status: 'In Progress', statusCategory: 'indeterminate', assignee: 'Alice', updated: '2026-11-09T08:00:00Z', created: '2026-11-03T09:00:00Z', dueDate: null, flagged: false, blockedBy: [], storyPoints: 3, commentCount: 1, priority: 'Medium', labels: [], url: null },
  { key: 'SHOP-17', summary: 'Empty-cart illustration', status: 'In Progress', statusCategory: 'indeterminate', assignee: 'Alice', updated: '2026-11-09T08:00:00Z', created: '2026-11-03T09:00:00Z', dueDate: null, flagged: false, blockedBy: [], storyPoints: 2, commentCount: 0, priority: 'Low', labels: [], url: null },
  { key: 'SHOP-18', summary: 'Promo code validation', status: 'In Progress', statusCategory: 'indeterminate', assignee: null, updated: '2026-11-10T07:00:00Z', created: '2026-11-05T09:00:00Z', dueDate: null, flagged: false, blockedBy: [], storyPoints: 3, commentCount: 0, priority: 'Medium', labels: [], url: null },
  { key: 'SHOP-21', summary: 'Shipping estimate API', status: 'To Do', statusCategory: 'new', assignee: 'Bob', updated: '2026-11-06T09:00:00Z', created: '2026-11-05T09:00:00Z', dueDate: '2026-11-11', flagged: false, blockedBy: [], storyPoints: 5, commentCount: 0, priority: 'Medium', labels: [], url: null },
  { key: 'SHOP-09', summary: 'Order confirmation email', status: 'Done', statusCategory: 'done', assignee: 'Bob', updated: '2026-11-07T09:00:00Z', created: '2026-10-30T09:00:00Z', dueDate: null, flagged: false, blockedBy: [], storyPoints: 3, commentCount: 2, priority: 'Medium', labels: [], url: null },
  { key: 'SHOP-10', summary: 'Address autocomplete', status: 'Done', statusCategory: 'done', assignee: 'Sue', updated: '2026-11-08T09:00:00Z', created: '2026-10-31T09:00:00Z', dueDate: null, flagged: false, blockedBy: [], storyPoints: 5, commentCount: 4, priority: 'Medium', labels: [], url: null },
];

const report = analyseSprint(issues, { now });

console.log(JSON.stringify(report.summary, null, 2));
console.log('\nFindings (high severity first):');
for (const f of report.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.key} — ${f.reason}`);
console.log('\nLoad:');
for (const r of report.load) console.log(`  ${r.assignee}: ${r.inProgress} in progress${r.overloaded ? ' (OVER LIMIT)' : ''}`);
console.log('\nBlocked:');
for (const b of report.blocked) console.log(`  ${b.key}${b.flagged ? ' (flagged)' : ''}${b.blockedBy.length ? ' blocked by ' + b.blockedBy.join(', ') : ''}`);
