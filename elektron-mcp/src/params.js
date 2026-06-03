// Named parameter map loader.
//
// Loads the curated Analog Rytm parameter -> CC/NRPN table and allows an
// override file via RYTM_PARAM_MAP (a JSON file in the same shape). Resolution
// is case-insensitive and tolerant of separators (filter-frequency,
// filter_frequency and "Filter Frequency" all resolve to the same entry).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAP_PATH = join(__dirname, '..', 'data', 'analog-rytm-params.json');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

let table;
try {
  const base = loadJson(DEFAULT_MAP_PATH);
  let merged = base.params || {};
  const overridePath = process.env.RYTM_PARAM_MAP;
  if (overridePath) {
    const override = loadJson(overridePath);
    merged = { ...merged, ...(override.params || override) };
  }
  table = merged;
} catch (err) {
  // Never let a bad map file kill the server; raw cc/nrpn tools still work.
  process.stderr.write(`[elektron-rytm-mcp] failed to load param map: ${err.message}\n`);
  table = {};
}

function normalizeKey(name) {
  return String(name).trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

const lookup = new Map(Object.entries(table).map(([k, v]) => [normalizeKey(k), { name: k, ...v }]));

/**
 * Resolve a named parameter to its CC/NRPN definition, or null if unknown.
 * @param {string} name
 */
export function resolveParam(name) {
  return lookup.get(normalizeKey(name)) || null;
}

/** List all known parameter names (sorted). */
export function listParams() {
  return [...lookup.values()].sort((a, b) => a.name.localeCompare(b.name));
}
