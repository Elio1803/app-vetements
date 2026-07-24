#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'tracking.json');
const templatePath = join(__dirname, 'template.html');
const outputPath = join(__dirname, 'dashboard.html');

const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'blocked'];
const BUG_STATUSES = ['open', 'investigating', 'fixed', 'ignored'];
const FEATURE_STATUSES = ['planned', 'in_progress', 'completed', 'deprecated'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

function validateTrackingData(data) {
  for (const key of ['projectState', 'tasks', 'bugs', 'features', 'changelog']) {
    if (!(key in data)) throw new Error(`tracking.json is missing top-level key "${key}"`);
  }
  for (const key of ['tasks', 'bugs', 'features', 'changelog']) {
    const ids = data[key].map(x => x.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) throw new Error(`tracking.json: duplicate ids in "${key}": ${dupes.join(', ')}`);
  }
  for (const t of data.tasks) {
    if (!TASK_STATUSES.includes(t.status)) throw new Error(`task ${t.id}: invalid status "${t.status}"`);
    if (!PRIORITIES.includes(t.priority)) throw new Error(`task ${t.id}: invalid priority "${t.priority}"`);
  }
  for (const b of data.bugs) {
    if (!BUG_STATUSES.includes(b.status)) throw new Error(`bug ${b.id}: invalid status "${b.status}"`);
    if (!PRIORITIES.includes(b.severity)) throw new Error(`bug ${b.id}: invalid severity "${b.severity}"`);
  }
  for (const f of data.features) {
    if (!FEATURE_STATUSES.includes(f.status)) throw new Error(`feature ${f.id}: invalid status "${f.status}"`);
  }
}

const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
validateTrackingData(data);

const template = readFileSync(templatePath, 'utf-8');
const marker = '/*__TRACKING_DATA__*/';
if (!template.includes(marker)) {
  throw new Error(`Placeholder ${marker} introuvable dans template.html`);
}

const output = template.replace(marker, JSON.stringify(data, null, 2));
writeFileSync(outputPath, output, 'utf-8');

console.log(
  `dashboard.html généré : ${data.tasks.length} tâches, ${data.bugs.length} bugs, ` +
  `${data.features.length} fonctionnalités, ${data.changelog.length} entrées de changelog.`
);
