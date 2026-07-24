#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'tracking.json');
const templatePath = join(__dirname, 'template.html');
const outputPath = join(__dirname, 'dashboard.html');

const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
const template = readFileSync(templatePath, 'utf-8');

const marker = '/*__TRACKING_DATA__*/';
if (!template.includes(marker)) {
  throw new Error(`Placeholder ${marker} introuvable dans template.html`);
}

const output = template.replace(marker, JSON.stringify(data, null, 2));
writeFileSync(outputPath, output, 'utf-8');

console.log(
  `dashboard.html généré : ${data.features.length} fonctionnalités, ` +
  `${data.history.length} entrées d'historique, ${data.bugs.length} bugs.`
);
