#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ClientAgentService } = require('../server/services/client-agent');
const { loadScenario } = require('../server/scenario-loader');

const scenarioId = process.argv[2] || 'pharmacy-management-system';
const weakMode = process.argv.includes('--weak');

const genericQuestions = [
  'Who are the different users or roles that will use this system?',
  'Do you operate from a single location or multiple locations or branches?',
  'How do you currently track your inventory, records, or data, and what problems come up?',
  'Walk me through what happens in your core daily workflow from start to finish.',
  'How do payments or transactions get handled and reconciled today?',
  'What reporting or visibility do you need across the business?',
  'What other tools or systems does this need to work with?',
];

const weakQuestions = [
  'What should the UI look like?',
  'Can we just make it modern, simple, and easy?',
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateTranscript(scenarioId, weakMode) {
  const scenario = loadScenario(scenarioId);
  const agent = new ClientAgentService();
  const session = agent.createSession(scenario);
  const questions = weakMode ? weakQuestions : genericQuestions;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    console.log(`[scenario] sending question ${index + 1}/${questions.length} for ${scenarioId}`);
    await delay(3000);
    await agent.respondToMessage(session.sessionId, question);
    console.log(`Question ${index + 1}/${questions.length} completed for ${scenarioId}`);

    if (index < questions.length - 1) {
      await delay(3000 + Math.random() * 500);
    }
  }

  const clientRepliesWithError = session.transcript.filter(
    (entry) => entry.role === 'client' && /failed|error|transient/i.test(entry.message || '')
  );

  return { session, hasError: clientRepliesWithError.length > 0 };
}

async function main() {
  const scenarioId = process.argv[2] || 'pharmacy-management-system';
  const weakMode = process.argv.includes('--weak');

  console.log(`Generating ${weakMode ? 'weak' : 'full'} transcript for scenario: ${scenarioId}`);

  let result = await generateTranscript(scenarioId, weakMode);
  if (result.hasError) {
    console.warn(`[scenario] Warning: transcript for ${scenarioId} contained error replies. Retrying once...`);
    await delay(5000);
    result = await generateTranscript(scenarioId, weakMode);
  }

  const transcriptDir = path.resolve(__dirname, '..', 'experiments', 'baseline-vs-final', 'transcripts');
  fs.mkdirSync(transcriptDir, { recursive: true });

  const outputName = weakMode ? `${scenarioId}-weak.json` : `${scenarioId}.json`;
  const outputPath = path.join(transcriptDir, outputName);
  fs.writeFileSync(outputPath, JSON.stringify(result.session.transcript, null, 2), 'utf8');

  console.log(`Saved transcript to ${outputPath}`);
}

main().catch((error) => {
  console.error(`Failed to generate transcript for ${scenarioId}:`, error.message || error);
  process.exitCode = 1;
});
