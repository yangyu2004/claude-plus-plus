import AdmZip from 'adm-zip';
import { readJsonSafe } from '../core.js';

function parseJsonLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const value = readJsonSafe(line, null);
      return value === null ? [] : [value];
    });
}

export function readClaudeExportZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

  return entries.flatMap((entry) => {
    const raw = zip.readAsText(entry, 'utf8');
    const lowerName = entry.entryName.toLowerCase();

    if (lowerName.endsWith('.jsonl') || lowerName.endsWith('.ndjson')) {
      return parseJsonLines(raw).map((json, lineIndex) => ({
        path: `${entry.entryName}#${lineIndex + 1}`,
        raw,
        json
      }));
    }

    if (lowerName.endsWith('.json') || lowerName.endsWith('.txt')) {
      const json = readJsonSafe(raw, null);
      return json === null ? [] : [{ path: entry.entryName, raw, json }];
    }

    return [];
  });
}

export function findDocument(documents, fileName) {
  return documents.find((document) => document.path === fileName) || null;
}
