#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createLLMProvider } = require('../server/llm/llm-provider');
const { loadScenario } = require('../server/scenario-loader');

function usage() {
  console.error('Usage: node scripts/run-baseline.js <transcript.json> <scenario-id> [resultKey]');
  process.exit(1);
}

function stripJsonFence(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseBaselineResponse(rawResult) {
  if (!rawResult) {
    return { error: 'No baseline response received.' };
  }

  if (rawResult?.error) {
    return { error: rawResult.message || 'Baseline evaluation failed.' };
  }

  const candidateText = typeof rawResult === 'string'
    ? rawResult
    : rawResult?.text || rawResult?.output || JSON.stringify(rawResult);

  const cleanedText = stripJsonFence(candidateText);
  try {
    const parsed = JSON.parse(cleanedText);
    return parsed;
  } catch (error) {
    return { error: `Baseline response could not be parsed as JSON: ${error.message}` };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const transcriptPathArg = process.argv[2];
  const scenarioId = process.argv[3];
  const resultKey = process.argv[4] || 'baseline';

  if (!transcriptPathArg || !scenarioId) {
    usage();
  }

  const transcriptPath = path.resolve(process.cwd(), transcriptPathArg);
  const scenario = loadScenario(scenarioId);
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));

  await sleep(9000);

  const provider = createLLMProvider();
  const requirementSummary = scenario.hiddenRequirements
    .map((requirement) => `- ${requirement.id}: ${requirement.name}\n  Description: ${requirement.description}\n  Category: ${requirement.category}\n  Priority: ${requirement.priority}\n  Evidence criteria: ${requirement.evidenceCriteria.join('; ')}`)
    .join('\n');

  const transcriptText = transcript
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.message}`)
    .join('\n');

  const prompt = `You are evaluating a developer's requirement-discovery conversation for a software project.\n\nThe goal is to assess how well the developer identified the actual business requirements from the conversation transcript.\n\nUse the hidden requirement matrix below as ground truth, but do NOT use the specialized rubric or the DISCOVERED/PARTIALLY_DISCOVERED/MISSED taxonomy. This is a simple baseline comparison, not a specialized evaluator.\n\nHidden requirement matrix:\n${requirementSummary}\n\nTranscript:\n${transcriptText}\n\nGive a general assessment in loose structured form. Return a JSON object with these keys only:\n- score: number from 0 to 100\n- foundRequirements: array of strings\n- missedRequirements: array of strings\n- unsupportedAssumptions: array of strings\n- feedback: string\n\nDo not mention that this is a baseline or that you are following a rubric. Just give the best practical judgment based on the transcript and the requirements above.`;

  const result = await provider.generateText([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 1500 });
  const parsedResult = parseBaselineResponse(result);
  const mode = result?.error || result?.fallback || parsedResult?.error ? 'fallback' : 'llm';

  const output = {
    scenarioId,
    transcriptPath,
    generatedAt: new Date().toISOString(),
    evaluationMode: mode,
    rawResult: parsedResult,
    modelUsed: result?.modelUsed || provider?.config?.model || 'unknown',
  };

  console.log(`[baseline] ${scenarioId}: evaluationMode=${output.evaluationMode}, modelUsed=${output.modelUsed}`);

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
  console.error('Baseline evaluation failed:', error.message || error);
  process.exit(1);
});
