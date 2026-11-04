// Resolver for the Sprint Sentinel Jira project page (UI Kit dashboard).
//
// It reuses the exact same tested pipeline as the Rovo agent / MCP tools:
// loadSprint() fetches the live board, analyseSprint() derives every finding.
// The UI never computes anything — it only renders what this returns.

const Resolver = require('@forge/resolver').default;
const { loadSprint } = require('../lib/jira');
const { analyseSprint, forecastSprint } = require('../lib/analysis');

const resolver = new Resolver();

resolver.define('getSprintReport', async ({ payload }) => {
  const boardId = String((payload && payload.boardId) || '').trim();
  if (!boardId) return { error: 'Enter the numeric board id (shown in the board URL as rapidView= or ?boardId=).' };
  if (!/^\d+$/.test(boardId)) return { error: 'The board id should be a number.' };
  try {
    const { sprint, issues } = await loadSprint(boardId);
    if (!sprint) return { boardId, sprint: null };
    const report = analyseSprint(issues, { now: new Date() });
    report.forecast = forecastSprint(report, sprint, new Date());
    return { boardId, sprint, report };
  } catch (e) {
    return { error: `Could not read board ${boardId}: ${e.message}` };
  }
});

exports.handler = resolver.getDefinitions();
