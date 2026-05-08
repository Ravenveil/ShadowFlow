#!/usr/bin/env node
// AI-translate missing keys in secondary locale files from a primary locale.
//
// Usage:
//   node scripts/i18n-translate.mjs                    # primary=zh, fills all others
//   node scripts/i18n-translate.mjs --primary en       # primary=en, fills others
//   node scripts/i18n-translate.mjs --target ja        # only fill ja.json
//   node scripts/i18n-translate.mjs --dry-run          # show what would change
//
// Requires ANTHROPIC_API_KEY in env (or .env loaded externally).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';

const LOCALES_DIR = resolve('src/common/i18n/locales');
const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 40; // keys per API call

const LANG_NAMES = {
  en: 'English',
  zh: 'Simplified Chinese (简体中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
};

const { values } = parseArgs({
  options: {
    primary: { type: 'string', default: 'zh' },
    target: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const primary = values.primary;
const dryRun = values['dry-run'];
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && !dryRun) {
  console.error('❌ ANTHROPIC_API_KEY env var required (or pass --dry-run).');
  process.exit(1);
}

const primaryPath = join(LOCALES_DIR, `${primary}.json`);
let primaryData;
try {
  primaryData = JSON.parse(readFileSync(primaryPath, 'utf8'));
} catch (e) {
  console.error(`❌ Could not read primary locale ${primaryPath}: ${e.message}`);
  process.exit(1);
}

const targets = values.target
  ? [values.target]
  : readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith('.json') && f !== `${primary}.json`)
      .map((f) => f.replace(/\.json$/, ''));

if (targets.length === 0) {
  console.log('No target locales found.');
  process.exit(0);
}

console.log(`Primary: ${primary} (${LANG_NAMES[primary] ?? primary})`);
console.log(`Targets: ${targets.join(', ')}`);
console.log(dryRun ? '(dry run — no API calls, no writes)' : '');

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

async function translateBatch(entries, targetLang) {
  const targetName = LANG_NAMES[targetLang] ?? targetLang;
  const primaryName = LANG_NAMES[primary] ?? primary;

  const userMessage = `Translate the following UI strings from ${primaryName} to ${targetName}.
Return ONLY a JSON object mapping each key to its translation, no extra text.
Preserve placeholders like {{name}}, %{var}, and emojis exactly. Keep tone concise and consistent with software UI.

Input:
${JSON.stringify(Object.fromEntries(entries), null, 2)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${text}`);
  return JSON.parse(match[0]);
}

const primaryFlat = flatten(primaryData);
let totalChanges = 0;

for (const target of targets) {
  const targetPath = join(LOCALES_DIR, `${target}.json`);
  let targetData = {};
  try {
    targetData = JSON.parse(readFileSync(targetPath, 'utf8'));
  } catch {
    console.log(`  (creating new file ${target}.json)`);
  }
  const targetFlat = flatten(targetData);

  const missing = Object.entries(primaryFlat).filter(
    ([k, v]) => typeof v === 'string' && (!targetFlat[k] || targetFlat[k] === '')
  );

  if (missing.length === 0) {
    console.log(`✓ ${target}: up to date`);
    continue;
  }

  console.log(`\n→ ${target}: ${missing.length} missing keys`);

  if (dryRun) {
    for (const [k, v] of missing.slice(0, 10)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
    if (missing.length > 10) console.log(`    … and ${missing.length - 10} more`);
    continue;
  }

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)}… `);
    try {
      const translated = await translateBatch(batch, target);
      for (const [k, v] of Object.entries(translated)) {
        targetFlat[k] = v;
        totalChanges++;
      }
      console.log(`${Object.keys(translated).length} keys`);
    } catch (e) {
      console.log(`failed: ${e.message}`);
    }
  }

  writeFileSync(targetPath, JSON.stringify(unflatten(targetFlat), null, 2) + '\n', 'utf8');
  console.log(`✓ ${target}: written`);
}

console.log(`\nDone. ${totalChanges} key(s) translated.`);
