#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const resultsPath = path.resolve(__dirname, '..', 'experiments', 'baseline-vs-final', 'results.json');
const reportPath = path.resolve(__dirname, '..', 'experiments', 'baseline-vs-final', 'report.md');

function parseNumericScore(raw, preferKey = null) {
  if (raw == null) return null;

  if (typeof raw === 'number') return raw;

  if (typeof raw === 'object') {
    if (raw.coverageScore != null && preferKey !== 'baseline') return Number(raw.coverageScore);
    if (raw.score != null && preferKey === 'baseline') return Number(raw.score);
    if (raw.rawResult && typeof raw.rawResult === 'object') {
      if (raw.rawResult.coverageScore != null) return Number(raw.rawResult.coverageScore);
      if (raw.rawResult.score != null) return Number(raw.rawResult.score);
    }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```\s*(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = fenced ? fenced[1] : trimmed;

    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.score === 'number') return parsed.score;
      if (typeof parsed.coverageScore === 'number') return parsed.coverageScore;
    } catch (error) {
      return null;
    }
  }

  return null;
}

function extractResultPayload(entry, key) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry[key]) return entry[key];
  if (entry.rawResult && typeof entry.rawResult === 'object') return entry.rawResult;
  return null;
}

function coerceReportData(results) {
  const scenarioRows = [];
  const scenarioIds = Object.keys(results || {});
  let totalBaseline = 0;
  let totalFinal = 0;
  let validBaselineCount = 0;
  let validFinalCount = 0;
  let baselineParseFailures = 0;
  let finalValidLlm = 0;

  for (const scenarioId of scenarioIds) {
    const entry = results[scenarioId] || {};
    const baselineObj = entry.baseline || null;
    const finalObj = entry.final || null;

    const baselineScore = parseNumericScore(baselineObj, 'baseline');
    const finalScore = parseNumericScore(finalObj, 'final');

    if (baselineScore == null) {
      baselineParseFailures += 1;
    } else {
      validBaselineCount += 1;
      totalBaseline += baselineScore;
    }

    if (finalScore != null) {
      validFinalCount += 1;
      totalFinal += finalScore;
    }

    if (finalObj && finalObj.evaluationMode === 'llm') {
      finalValidLlm += 1;
    }

    const delta = finalScore == null || baselineScore == null ? null : finalScore - baselineScore;
    scenarioRows.push({ scenarioId, baselineScore, finalScore, delta });
  }

  const averageBaseline = validBaselineCount ? (totalBaseline / validBaselineCount) : null;
  const averageFinal = validFinalCount ? (totalFinal / validFinalCount) : null;

  return { scenarioRows, averageBaseline, averageFinal, baselineParseFailures, finalValidLlm };
}

function main() {
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`Results file not found: ${resultsPath}`);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const { scenarioRows, averageBaseline, averageFinal, baselineParseFailures, finalValidLlm } = coerceReportData(results);

  const lines = [];
  lines.push('# Baseline vs Final Evaluation Report');
  lines.push('');
  lines.push('| Scenario | Baseline score | Final coverageScore | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');

  for (const row of scenarioRows) {
    const baseline = row.baselineScore == null ? 'N/A' : String(row.baselineScore);
    const finalValue = row.finalScore == null ? 'N/A' : String(row.finalScore);
    const delta = row.delta == null ? 'N/A' : String(row.delta);
    lines.push(`| ${row.scenarioId} | ${baseline} | ${finalValue} | ${delta} |`);
  }

  lines.push('');
  lines.push(`- Average baseline score: ${averageBaseline == null ? 'N/A' : averageBaseline.toFixed(2)}`);
  lines.push(`- Average final coverage score: ${averageFinal == null ? 'N/A' : averageFinal.toFixed(2)}`);
  lines.push(`- Baseline outputs that failed to parse as clean JSON: ${baselineParseFailures}`);
  lines.push(`- Final outputs with valid evaluationMode: "llm": ${finalValidLlm}`);
  lines.push('');

  const multiBranchEntry = results['multi-branch-retail'] || {};
  const weakBaseline = multiBranchEntry.weakBaseline || null;
  const weakFinal = multiBranchEntry.weakFinal || null;
  const weakBaselineScore = parseNumericScore(weakBaseline, 'baseline');
  const weakFinalScore = parseNumericScore(weakFinal, 'final');

  lines.push('The multi-branch-retail scenario was intentionally made more challenging with overlapping operational, pricing, stock, and branch-control requirements. In the weak-transcript case, the developer asked only for a modern UI and a simple design, which is expected to cause low coverage and multiple missed requirements. The comparison shows the contrast between the deliberately shallow conversation and the fuller branch-operations conversation, which is exactly the kind of stress case we want the evaluator to separate clearly.');
  lines.push('');
  lines.push(`Weak transcript snapshot: baseline score ${weakBaselineScore == null ? 'N/A' : weakBaselineScore}, final coverageScore ${weakFinalScore == null ? 'N/A' : weakFinalScore}.`);

  fs.writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  console.log(`Report written to ${reportPath}`);
  console.log(lines.join('\n'));
}

main();
