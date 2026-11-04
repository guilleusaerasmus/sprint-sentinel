// Tests for the sprint outcome forecast (src/lib/analysis.js -> forecastSprint).
//
// The forecast is a transparent pace extrapolation plus risk-based downgrades,
// so these lock down the arithmetic and the confidence rules.

const { test } = require('node:test');
const assert = require('node:assert');

const { forecastSprint } = require('../src/lib/analysis');

function report({ total, done, high = 0, overloaded = 0 }) {
  return {
    summary: {
      total,
      done,
      completionPercent: total ? Math.round((done / total) * 100) : 0,
      findingsBySeverity: { high, medium: 0, low: 0 },
    },
    load: Array.from({ length: overloaded }, (_, i) => ({ assignee: `P${i}`, overloaded: true })),
  };
}

const sprint = (startDate, endDate) => ({ startDate, endDate });
const NOW = '2026-11-06T00:00:00Z';
const WINDOW = sprint('2026-11-01T00:00:00Z', '2026-11-11T00:00:00Z'); // 50% elapsed at NOW

test('forecast: behind pace projects a shortfall and low confidence', () => {
  const f = forecastSprint(report({ total: 8, done: 2 }), WINDOW, NOW); // 25% done, 50% elapsed
  assert.strictEqual(f.projectedCompletionPercent, 50); // 0.25 / 0.5
  assert.strictEqual(f.confidence, 'low');
});

test('forecast: on pace with no risks is high confidence', () => {
  const f = forecastSprint(report({ total: 10, done: 6 }), WINDOW, NOW); // 60% done, 50% elapsed
  assert.strictEqual(f.projectedCompletionPercent, 100); // min(1, 0.6/0.5)
  assert.strictEqual(f.confidence, 'high');
});

test('forecast: good pace but serious risks is downgraded to medium', () => {
  const f = forecastSprint(report({ total: 10, done: 6, high: 2 }), WINDOW, NOW);
  assert.strictEqual(f.confidence, 'medium'); // would be high, downgraded by 2 high risks
});

test('forecast: many high risks push medium down to low', () => {
  const f = forecastSprint(report({ total: 10, done: 4, high: 3 }), WINDOW, NOW); // projected 80% -> medium
  assert.strictEqual(f.confidence, 'low');
});

test('forecast: with no sprint dates, it falls back to current completion', () => {
  const f = forecastSprint(report({ total: 8, done: 2 }), {}, NOW);
  assert.strictEqual(f.projectedCompletionPercent, null);
  assert.strictEqual(f.confidence, 'low');
  assert.ok(f.drivers.some((d) => /current completion only/i.test(d)));
});

test('forecast: an overloaded person downgrades otherwise-high confidence', () => {
  const f = forecastSprint(report({ total: 10, done: 6, overloaded: 1 }), WINDOW, NOW);
  assert.strictEqual(f.confidence, 'medium');
});
