#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const scenarioIds = [
  'restaurant-pos',
  'gym-management',
  'hospital-appointment-system',
  'freelance-marketplace',
  'multi-branch-retail',
];

const baseDir = path.resolve(__dirname, '..');
const resultsPath = path.join(baseDir, 'experiments', 'baseline-vs-final', 'results.json');
const transcriptsDir = path.join(baseDir, 'experiments', 'baseline-vs-final', 'transcripts');
const checkpointPath = path.join(baseDir, 'experiments', 'baseline-vs-final', '.batch-checkpoint.json');
const MIN_LLM_DELAY_MS = 10000;
const RESUME_MODE = process.argv.includes('--resume');

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.mkdirSync(transcriptsDir, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isVerifiedLlmEntry(entry) {
  return !!(
    entry &&
    entry.evaluationMode === 'llm' &&
    entry.rawResult &&
    typeof entry.rawResult === 'object' &&
    !(entry.rawResult.error)
  );
}

function loadCheckpoint() {
  if (!fs.existsSync(checkpointPath)) {
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    let scenarios = raw;
    while (scenarios && scenarios.completedScenarios) {
      scenarios = scenarios.completedScenarios;
    }
    return scenarios || {};
  } catch (error) {
    console.warn(`[batch] checkpoint unreadable, resetting: ${error.message}`);
    return {};
  }
}

function saveCheckpoint(completedScenarios) {
  fs.writeFileSync(checkpointPath, JSON.stringify({ completedScenarios }, null, 2), 'utf8');
}

function loadExistingResults() {
  if (!fs.existsSync(resultsPath)) {
    fs.writeFileSync(resultsPath, '{}', 'utf8');
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (error) {
    console.warn(`[batch] results file unreadable, resetting: ${error.message}`);
    fs.writeFileSync(resultsPath, '{}', 'utf8');
    return {};
  }
}

function runNodeScript(scriptName, args, label) {
  console.log(`[batch] running ${label || scriptName} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [scriptName, ...args], {
    cwd: baseDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[batch] failed to execute ${scriptName}:`, result.error.message);
    return { ok: false, error: result.error };
  }

  if (result.status !== 0) {
    console.error(`[batch] script failed with exit code ${result.status}: node ${scriptName} ${args.join(' ')}`);
    return { ok: false, error: new Error(`Exit code ${result.status}`) };
  }

  console.log(`[batch] success: ${label || scriptName}`);
  return { ok: true };
}

async function main() {
  const completedScenarios = loadCheckpoint();
  const results = loadExistingResults();

  for (let index = 0; index < scenarioIds.length; index += 1) {
    const scenarioId = scenarioIds[index];
    const transcriptPath = path.join(transcriptsDir, `${scenarioId}.json`);
    const weakTranscriptPath = path.join(transcriptsDir, `${scenarioId}-weak.json`);
    const scenarioResults = results[scenarioId] || {};
    const hasVerifiedLlmResults = !!(
      isVerifiedLlmEntry(scenarioResults.baseline) &&
      isVerifiedLlmEntry(scenarioResults.final)
    );

    if (RESUME_MODE && completedScenarios[scenarioId] && hasVerifiedLlmResults) {
      console.log(`[batch] skipping ${scenarioId} because it already completed with genuine llm results`);
      continue;
    }

    if (RESUME_MODE && hasVerifiedLlmResults) {
      console.log(`[batch] skipping ${scenarioId} because baseline + final are both genuine llm results`);
      continue;
    }

    console.log(`\n=== Scenario ${index + 1}/${scenarioIds.length}: ${scenarioId} ===`);

    if (!fs.existsSync(transcriptPath)) {
      const transcriptStep = runNodeScript('scripts/run-scenario-conversation.js', [scenarioId], 'transcript');
      if (!transcriptStep.ok) {
        console.warn(`[batch] transcript generation failed for ${scenarioId}; continuing to next scenario.`);
        await delay(MIN_LLM_DELAY_MS);
        continue;
      }
      await delay(MIN_LLM_DELAY_MS);
    } else {
      console.log(`[batch] transcript exists for ${scenarioId}; reusing it`);
    }

    const baselineStep = runNodeScript('scripts/run-baseline.js', [transcriptPath, scenarioId, 'baseline'], 'baseline');
    await delay(MIN_LLM_DELAY_MS);
    const finalStep = runNodeScript('scripts/run-final.js', [transcriptPath, scenarioId, 'final'], 'final');

    if (!baselineStep.ok || !finalStep.ok) {
      console.warn(`[batch] evaluation failed for ${scenarioId}; continuing to next scenario.`);
    }

    if (scenarioId === 'multi-branch-retail') {
      const weakBaselineEntry = results[scenarioId] && results[scenarioId].weakBaseline;
      const weakFinalEntry = results[scenarioId] && results[scenarioId].weakFinal;
      const hasVerifiedWeakLlm = !!(
        weakBaselineEntry &&
        weakFinalEntry &&
        weakBaselineEntry.evaluationMode === 'llm' &&
        weakFinalEntry.evaluationMode === 'llm'
      );

      if (!hasVerifiedWeakLlm) {
        if (!fs.existsSync(weakTranscriptPath)) {
          const weakTranscriptStep = runNodeScript('scripts/run-scenario-conversation.js', [scenarioId, '--weak'], 'weak transcript');
          if (!weakTranscriptStep.ok) {
            console.warn(`[batch] weak transcript generation failed for ${scenarioId}; continuing.`);
          } else {
            await delay(MIN_LLM_DELAY_MS);
          }
        } else {
          console.log(`[batch] weak transcript exists for ${scenarioId}; reusing it`);
        }

        if (fs.existsSync(weakTranscriptPath)) {
          const weakBaselineStep = runNodeScript('scripts/run-baseline.js', [weakTranscriptPath, scenarioId, 'weakBaseline'], 'weak baseline');
          await delay(MIN_LLM_DELAY_MS);
          const weakFinalStep = runNodeScript('scripts/run-final.js', [weakTranscriptPath, scenarioId, 'weakFinal'], 'weak final');
          if (!weakBaselineStep.ok || !weakFinalStep.ok) {
            console.warn(`[batch] weak evaluation failed for ${scenarioId}; continuing.`);
          }
        }
      } else {
        console.log(`[batch] skipping weak transcript for ${scenarioId} because both weak baseline and weak final are genuine llm results`);
      }
    }

    completedScenarios[scenarioId] = { transcriptPath, completedAt: new Date().toISOString() };
    saveCheckpoint(completedScenarios);
    const updatedResults = loadExistingResults();
    fs.writeFileSync(resultsPath, JSON.stringify(updatedResults, null, 2), 'utf8');
    await delay(MIN_LLM_DELAY_MS);
  }

  console.log('\nBatch run completed. Results saved to', resultsPath);
}

main().catch((error) => {
  console.error('Batch experiment run failed unexpectedly:', error.message || error);
  process.exitCode = 1;
});
