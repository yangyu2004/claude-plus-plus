import AdmZip from 'adm-zip';
import { readJsonSafe } from '../core.js';

const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

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

function entrySize(entry) {
  return Number(entry.header?.size || 0);
}

function validateEntries(entries, {
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxEntryBytes = DEFAULT_MAX_ENTRY_BYTES,
  maxTotalUncompressedBytes = DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES
} = {}) {
  if (entries.length > maxEntries) {
    throw new Error(`Export zip has too many files (${entries.length}); limit is ${maxEntries}`);
  }

  let totalBytes = 0;
  for (const entry of entries) {
    const size = entrySize(entry);
    if (size > maxEntryBytes) {
      throw new Error(`Export zip entry is too large: ${entry.entryName}`);
    }

    totalBytes += size;
    if (totalBytes > maxTotalUncompressedBytes) {
      throw new Error(`Export zip uncompressed content is too large; limit is ${maxTotalUncompressedBytes} bytes`);
    }
  }
}

export function readClaudeExportZip(zipPath, options = {}) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  validateEntries(entries, options);

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
