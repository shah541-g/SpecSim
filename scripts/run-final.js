#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { loadScenario } = require('../server/scenario-loader');
const { EvaluatorAgentService } = require('../server/services/evaluator-agent');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  console.error('Usage: node scripts/run-final.js <transcript.json> <scenario-id> [resultKey]');
  process.exit(1);
}

async function main() {
  const transcriptPathArg = process.argv[2];
  const scenarioId = process.argv[3];
  const resultKey = process.argv[4] || 'final';

  if (!transcriptPathArg || !scenarioId) {
    usage();
  }

  const transcriptPath = path.resolve(process.cwd(), transcriptPathArg);
  const scenario = loadScenario(scenarioId);
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));

  console.log(`[final] ${scenarioId}: waiting before evaluation...`);
  await sleep(10000);

  const evaluator = new EvaluatorAgentService();
  const result = await evaluator.evaluateTranscript({
    transcript,
    requirements: scenario.hiddenRequirements,
    rubric: scenario.evaluationRubric,
  });

  const output = {
    scenarioId,
    transcriptPath,
    generatedAt: new Date().toISOString(),
    evaluationMode: result?.evaluationMode || 'llm',
    rawResult: result,
  };

  console.log(`[final] ${scenarioId}: evaluationMode=${output.evaluationMode}, modelUsed=${result?.modelUsed || 'unknown'}`);

  const resultsDir = path.resolve(__dirname, '..', 'experiments', 'baseline-vs-final');
  fs.mkdirSync(resultsDir, { recursive: true });

  const resultsPath = path.join(resultsDir, 'results.json');
  let existing = {};
  if (fs.existsSync(resultsPath)) {
    existing = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  }

  existing[scenarioId] = { ...(existing[scenarioId] || {}), [resultKey]: output };
  fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('Final evaluation failed:', error.message || error);
  process.exit(1);
});
