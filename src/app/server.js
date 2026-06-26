import http from 'node:http';
import { URL } from 'node:url';
import { countConversations, countProjects, getConversation, getImportMetadata, getLatestImport, getProject, listConversations, listProjects } from '../db/database.js';
import { conversationToMarkdown } from '../render/markdown.js';
import { importArchiveFromBuffer } from '../import/import-archive.js';

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-filename'
  });
  res.end(JSON.stringify(payload));
}

function writeCorsPreflight(res) {
  res.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-filename',
    'access-control-max-age': '86400'
  });
  res.end();
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

export function createAppServer({ database, port = 8787 } = {}) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;
    const query = requestUrl.searchParams.get('q') || '';

    if (req.method === 'OPTIONS' && (pathname.startsWith('/api/') || pathname === '/import')) {
      writeCorsPreflight(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/import') {
      let rawBody = Buffer.alloc(0);
      req.on('data', (chunk) => {
        rawBody = Buffer.concat([rawBody, chunk]);
      });
      req.on('end', () => {
        try {
          const fileName = decodeURIComponent(String(req.headers['x-filename'] || 'upload.zip'));
          const result = importArchiveFromBuffer(database, rawBody, fileName);
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: error.message });
        }
      });
      return;
    }

    if (pathname === '/api/conversations') {
      const conversations = listConversations(database, { q: query, limit: 1000, offset: 0 });
      writeJson(res, 200, { conversations });
      return;
    }

    if (pathname === '/api/projects') {
      const projects = listProjects(database);
      writeJson(res, 200, { projects });
      return;
    }

    if (pathname === '/api/overview') {
      writeJson(res, 200, buildSummary(database));
      return;
    }

    if (pathname.startsWith('/api/conversations/')) {
      const conversationId = decodeURIComponent(pathname.replace('/api/conversations/', ''));
      const conversation = getConversation(database, conversationId);
      if (!conversation) {
        writeJson(res, 404, { error: 'Conversation not found' });
        return;
      }

      writeJson(res, 200, { conversation });
      return;
    }

    if (pathname.startsWith('/api/projects/')) {
      const projectId = decodeURIComponent(pathname.replace('/api/projects/', ''));
      const project = getProject(database, projectId);
      if (!project) {
        writeJson(res, 404, { error: 'Project not found' });
        return;
      }

      writeJson(res, 200, { project });
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
        server.listen(port, () => resolve(server.address()));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}
