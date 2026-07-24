#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'tracking.json');

if (!existsSync(dataPath)) {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(readFileSync(dataPath, 'utf-8'));
} catch {
  process.exit(0);
}

const ps = data.projectState || {};
const bugs = data.bugs || [];
const tasks = data.tasks || [];

const openBugs = bugs
  .filter((b) => b.status === 'open' || b.status === 'investigating')
  .sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });

const blockedTasks = tasks.filter((t) => t.status === 'blocked');

let agentBranches = [];
try {
  const out = execSync('git branch --list "agent/*" --format="%(refname:short)"', {
    cwd: join(__dirname, '..', '..'),
    encoding: 'utf-8',
  });
  agentBranches = out.split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  agentBranches = [];
}

const lines = [];
lines.push(`AI Project Manager — ${ps.projectName || 'projet'} (${ps.currentPhase || '?'}, ${ps.progress ?? '?'}%)`);
lines.push(`Priorité du jour : ${ps.currentPriority || 'non définie'}`);
if (ps.nextAction) lines.push(`Prochaine action : ${ps.nextAction}`);
if (openBugs.length) {
  const top = openBugs.slice(0, 3).map((b) => `${b.severity}: ${b.title}`).join(' | ');
  lines.push(`Bugs ouverts (${openBugs.length}) : ${top}`);
}
if (blockedTasks.length) {
  lines.push(`Tâches bloquées : ${blockedTasks.map((t) => t.title).join(', ')}`);
}
if (agentBranches.length) {
  lines.push(`Branches de l'agent planifié en attente de relecture : ${agentBranches.join(', ')}`);
}

const recap = lines.join('\n');

const output = {
  systemMessage: recap,
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: `Recap AI Project Manager (voir docs/dev-tracking/tracking.json pour le détail) :\n${recap}\n\nPrésente ce recap comme ton tout premier message de cette session, avant de traiter la demande de l'utilisateur.`,
  },
};

console.log(JSON.stringify(output));
