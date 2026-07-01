import http from 'node:http';
import { URL } from 'node:url';
import { countConversations, countProjects, getConversation, getImportMetadata, getLatestImport, getProject, listConversations, listProjects } from '../db/database.js';
import { conversationToMarkdown } from '../render/markdown.js';
import { importArchiveFromBuffer } from '../import/import-archive.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_IMPORT_MAX_BYTES = 512 * 1024 * 1024;

function corsHeaders(corsOrigin) {
  if (!corsOrigin) return {};

  return {
    'access-control-allow-origin': corsOrigin,
    vary: 'Origin'
  };
}

function writeJson(res, statusCode, payload, { corsOrigin = null } = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-filename',
    ...corsHeaders(corsOrigin)
  });
  res.end(JSON.stringify(payload));
}

function writeCorsPreflight(res, { corsOrigin = null } = {}) {
  res.writeHead(204, {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-filename',
    'access-control-max-age': '86400',
    ...corsHeaders(corsOrigin)
  });
  res.end();
}

function formatByteLimit(limit) {
  if (limit < 1024 * 1024) {
    return `${limit} bytes`;
  }

  return `${Math.round(limit / 1024 / 1024)} MiB`;
}

function importLimitError(limit) {
  return {
    error: `Import upload exceeds the ${formatByteLimit(limit)} limit`
  };
}

function writeImportLimitExceeded(req, res, limit, { corsOrigin = null } = {}) {
  req.resume();
  writeJson(res, 413, importLimitError(limit), { corsOrigin });
}

function decodeFileNameHeader(headerValue) {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  try {
    return decodeURIComponent(String(value || 'upload.zip'));
  } catch {
    const error = new Error('Invalid x-filename header');
    error.statusCode = 400;
    throw error;
  }
}

function readRequestBody(req, res, limit, onBody, { corsOrigin = null } = {}) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > limit) {
    writeImportLimitExceeded(req, res, limit, { corsOrigin });
    return;
  }

  const chunks = [];
  let totalBytes = 0;
  let rejected = false;

  req.on('data', (chunk) => {
    if (rejected) return;

    totalBytes += chunk.length;
    if (totalBytes > limit) {
      rejected = true;
      chunks.length = 0;
      writeImportLimitExceeded(req, res, limit, { corsOrigin });
      return;
    }

    chunks.push(chunk);
  });

  req.on('end', () => {
    if (rejected) return;
    onBody(Buffer.concat(chunks, totalBytes));
  });

  req.on('error', (error) => {
    if (!res.writableEnded) {
      writeJson(res, 400, { error: error.message }, { corsOrigin });
    }
  });
}

function summaryFileName(conversation) {
  return conversation.title
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'conversation';
}

function contentDispositionAttachment(fileName) {
  const asciiFallback = fileName.replace(/[^\w.-]/g, '-') || 'download.md';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function buildSummary(database) {
  const projects = listProjects(database);
  const latestImport = getLatestImport(database);
  const metadata = latestImport ? getImportMetadata(database, latestImport.source_hash) : null;
  return {
    conversations: countConversations(database),
    projects: countProjects(database),
    docs: projects.reduce((total, project) => total + project.docs.length, 0),
    memories: metadata?.memoriesJson
      ? Array.isArray(metadata.memoriesJson)
        ? metadata.memoriesJson.length
        : Object.keys(metadata.memoriesJson).length
      : 0
  };
}

export function createAppServer({
  database,
  port = 8787,
  host = DEFAULT_HOST,
  importMaxBytes = DEFAULT_IMPORT_MAX_BYTES,
  corsOrigin = null
} = {}) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;
    const query = requestUrl.searchParams.get('q') || '';

    if (req.method === 'OPTIONS' && (pathname.startsWith('/api/') || pathname === '/import')) {
      writeCorsPreflight(res, { corsOrigin });
      return;
    }

    if (req.method === 'POST' && pathname === '/import') {
      readRequestBody(req, res, importMaxBytes, (rawBody) => {
        try {
          const fileName = decodeFileNameHeader(req.headers['x-filename']);
          const result = importArchiveFromBuffer(database, rawBody, fileName);
          writeJson(res, 200, result, { corsOrigin });
        } catch (error) {
          writeJson(res, error.statusCode || 500, { error: error.message }, { corsOrigin });
        }
      }, { corsOrigin });
      return;
    }

    if (pathname === '/api/conversations') {
      const conversations = listConversations(database, { q: query, limit: 1000, offset: 0 });
      writeJson(res, 200, { conversations }, { corsOrigin });
      return;
    }

    if (pathname === '/api/projects') {
      const projects = listProjects(database);
      writeJson(res, 200, { projects }, { corsOrigin });
      return;
    }

    if (pathname === '/api/overview') {
      writeJson(res, 200, buildSummary(database), { corsOrigin });
      return;
    }

    if (pathname.startsWith('/api/conversations/')) {
      const conversationId = decodeURIComponent(pathname.replace('/api/conversations/', ''));
      const conversation = getConversation(database, conversationId);
      if (!conversation) {
        writeJson(res, 404, { error: 'Conversation not found' }, { corsOrigin });
        return;
      }

      writeJson(res, 200, { conversation }, { corsOrigin });
      return;
    }

    if (pathname.startsWith('/api/projects/')) {
      const projectId = decodeURIComponent(pathname.replace('/api/projects/', ''));
      const project = getProject(database, projectId);
      if (!project) {
        writeJson(res, 404, { error: 'Project not found' }, { corsOrigin });
        return;
      }

      writeJson(res, 200, { project }, { corsOrigin });
      return;
    }

    if (pathname.startsWith('/export/')) {
      const target = decodeURIComponent(pathname.replace('/export/', ''));
      const conversations = target === 'all'
        ? listConversations(database, { limit: 10000, offset: 0 })
        : listConversations(database, { q: query, limit: 10000, offset: 0 }).filter((conversation) => conversation.id === target);

      if (conversations.length === 0) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Conversation not found');
        return;
      }

      const markdown = conversations.map((summary) => {
        const conversation = getConversation(database, summary.id);
        return conversationToMarkdown(conversation);
      }).join('\n---\n\n');

      const fileName = target === 'all'
        ? 'claude-history-export.md'
        : `${summaryFileName(conversations[0])}.md`;

      res.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': contentDispositionAttachment(fileName)
      });
      res.end(markdown);
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Not found',
      routes: [
        '/api/overview',
        '/api/conversations',
        '/api/conversations/:id',
        '/api/projects',
        '/api/projects/:id',
        '/export/all',
        '/export/:id',
        '/import'
      ]
    }));
  });

  return {
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}
