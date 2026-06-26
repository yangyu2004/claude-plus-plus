import http from 'node:http';
import { URL } from 'node:url';
import { countConversations, countProjects, getConversation, getImportMetadata, getLatestImport, getProject, listConversations, listProjects } from '../db/database.js';
import { conversationToMarkdown } from '../render/markdown.js';
import { importArchiveFromBuffer } from '../import/import-archive.js';
import { escapeHtml } from '../core.js';
import { renderConversationDetail, renderConversationList, renderLayout, renderListPage, renderPagination, renderProjectDetail, renderProjects, renderSummaryCards, renderWorkflowPanel } from './ui.js';

const CONVERSATION_PAGE_SIZE = 80;

function currentPageFrom(searchParams) {
  const page = Number.parseInt(searchParams.get('page') || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

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

function buildSummaryCards(database) {
  const projects = listProjects(database);
  const latestImport = getLatestImport(database);
  const metadata = latestImport ? getImportMetadata(database, latestImport.source_hash) : null;
  const memoryCount = metadata?.memoriesJson
    ? Array.isArray(metadata.memoriesJson)
      ? metadata.memoriesJson.length
      : Object.keys(metadata.memoriesJson).length
    : 0;

  return [
    { label: '对话', value: String(countConversations(database)), hint: '已导入会话数量' },
    { label: '项目', value: String(countProjects(database)), hint: '项目档案数量' },
    { label: '文档', value: String(projects.reduce((total, project) => total + project.docs.length, 0)), hint: '项目附带文档' },
    { label: '记忆', value: String(memoryCount), hint: latestImport ? `来自 ${latestImport.source_hash.slice(0, 8)}` : '暂无导入' }
  ];
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
      const conversations = listConversations(database, { q: query, limit: 500, offset: 0 });
      writeJson(res, 200, { conversations });
      return;
    }

    if (pathname === '/api/projects') {
      const projects = listProjects(database);
      writeJson(res, 200, { projects });
      return;
    }

    if (pathname === '/api/overview') {
      const projects = listProjects(database);
      const latestImport = getLatestImport(database);
      const metadata = latestImport ? getImportMetadata(database, latestImport.source_hash) : null;
      writeJson(res, 200, {
        conversations: countConversations(database),
        projects: countProjects(database),
        docs: projects.reduce((total, project) => total + project.docs.length, 0),
        memories: metadata?.memoriesJson
          ? Array.isArray(metadata.memoriesJson)
            ? metadata.memoriesJson.length
            : Object.keys(metadata.memoriesJson).length
          : 0
      });
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
        'content-disposition': contentDispositionAttachment(fileName),
      });
      res.end(markdown);
      return;
    }

    const projects = listProjects(database);
    const imported = requestUrl.searchParams.get('imported');
    const skipped = requestUrl.searchParams.get('skipped');
    const statusMessage = imported !== null ? (skipped === '1' ? '该 ZIP 已导入过，已跳过重复导入。' : `已导入 ${imported} 条对话。`) : '';
    const summaryCards = buildSummaryCards(database);

    if (pathname === '/' || pathname === '') {
      const conversations = listConversations(database, { q: query, limit: 8, offset: 0 });
      const projectList = projects.slice(0, 6);
      const recentConversationId = conversations[0]?.id || '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue',
        heading: '概览',
        subtitle: '先看状态，再进入对话或项目。首页只保留最常用的入口，不把你带进太深的层级。',
        query,
        searchAction: '/conversations',
        searchPlaceholder: '搜索对话标题、正文或项目名',
        searchName: 'q',
        content: `<section class="home-grid">
          <section class="panel">
            <div class="panel__head">
              <div>
                <div class="detail-kicker">Overview</div>
                <h2>当前状态</h2>
                <p>对话、项目、文档和记忆的总量放在这里，先判断库里有没有东西，再决定下一步。</p>
              </div>
              <div class="muted">${statusMessage ? escapeHtml(statusMessage) : 'Ready'}</div>
            </div>
            <div class="panel__body">${renderSummaryCards(summaryCards)}</div>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div>
                <div class="detail-kicker">Recent</div>
                <h2>最近对话</h2>
                <p>默认只看最近 8 条，避免首页被长列表撑满。</p>
              </div>
              <div class="muted">${escapeHtml(String(conversations.length))} 条</div>
            </div>
            <div class="panel__body">
              <div class="list">${renderConversationList(conversations, recentConversationId, query)}</div>
              <div class="footer-actions">
                <a class="action action--solid" href="/conversations">打开全部对话</a>
                <a class="action" href="/projects">打开项目列表</a>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel__head">
              <div>
                <div class="detail-kicker">Projects</div>
                <h2>最近项目</h2>
                <p>只放最近几个项目，避免首页太长。需要更多时再进完整列表。</p>
              </div>
              <div class="muted">${escapeHtml(String(projectList.length))} 个</div>
            </div>
            <div class="panel__body">
              <div class="list">${renderProjects(projectList)}</div>
            </div>
          </section>
        </section>`,
        backHref: '/conversations',
        backLabel: '打开全部对话',
      }));
      return;
    }

    if (pathname === '/stats') {
      const latestImport = getLatestImport(database);
      const metadata = latestImport ? getImportMetadata(database, latestImport.source_hash) : null;
      const importMeta = latestImport
        ? `最近导入：${latestImport.source_hash.slice(0, 12)}`
        : '暂无导入记录';
      const content = `<section class="home-grid">
        <section class="panel">
          <div class="panel__head">
            <div>
              <div class="detail-kicker">Stats</div>
              <h2>本地档案统计</h2>
              <p>这里展示导入后的总量和官方导出里可继续使用的结构化数据。</p>
            </div>
            <div class="muted">${escapeHtml(importMeta)}</div>
          </div>
          <div class="panel__body">${renderSummaryCards(summaryCards)}</div>
        </section>
        <section class="panel">
          <div class="panel__head">
            <div>
              <div class="detail-kicker">API</div>
              <h2>数据接口</h2>
              <p>需要继续开发桌面版或网页版恢复工具时，可以从这些 JSON 接口读取结构化结果。</p>
            </div>
          </div>
          <div class="panel__body">
            <div class="footer-actions">
              <a class="action action--solid" href="/api/overview">概览 JSON</a>
              <a class="action" href="/api/conversations">对话 JSON</a>
              <a class="action" href="/api/projects">项目 JSON</a>
            </div>
            <div class="empty-state" style="margin-top:16px">metadata: ${escapeHtml(metadata ? 'projects / users / memories 已读取' : '暂无 metadata')}</div>
          </div>
        </section>
      </section>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue - Stats',
        heading: '统计',
        subtitle: '查看本地档案规模、导入状态和开发用 JSON 接口。',
        content,
        backHref: '/',
        backLabel: '返回概览',
        query,
        searchAction: '/conversations',
        searchPlaceholder: '搜索对话标题、正文或项目名',
        searchName: 'q'
      }));
      return;
    }

    if (pathname === '/conversations') {
      const page = currentPageFrom(requestUrl.searchParams);
      const offset = (page - 1) * CONVERSATION_PAGE_SIZE;
      const pageResults = listConversations(database, { q: query, limit: CONVERSATION_PAGE_SIZE + 1, offset });
      const hasNext = pageResults.length > CONVERSATION_PAGE_SIZE;
      const conversations = pageResults.slice(0, CONVERSATION_PAGE_SIZE);
      const content = `<section class="split">
        <aside class="side">
          <div class="side-head">
            <h2>对话列表</h2>
            <div class="muted">${escapeHtml(String(conversations.length))} 条</div>
          </div>
          <div class="side-body">
            <div class="list">${renderConversationList(conversations, '', query)}</div>
            ${renderPagination({ basePath: '/conversations', query, page, hasNext, pageSize: CONVERSATION_PAGE_SIZE, itemCount: conversations.length })}
          </div>
        </aside>
        ${renderWorkflowPanel({
          title: '对话工作区',
          body: '列表页负责快速检索和定位，完整消息只在详情页加载，避免大批量记录时页面变慢。',
          steps: [
            query ? `当前正在搜索：${query}` : '输入关键词搜索标题、正文或项目名',
            '点击任意对话进入完整详情',
            '在详情页按需导出单条 Markdown，或从顶部导出全部'
          ],
          actions: '<a class="action action--solid" href="/export/all">导出全部</a><a class="action" href="/projects">查看项目</a>'
        })}
      </section>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue - Conversations',
        heading: '对话',
        subtitle: '按标题、正文和项目名检索，再点进详情查看完整上下文。',
        content,
        backHref: '/',
        backLabel: '返回概览',
        query,
        searchAction: '/conversations',
        searchPlaceholder: '搜索对话标题、正文或项目名',
        searchName: 'q'
      }));
      return;
    }

    if (pathname === '/projects') {
      const filteredProjects = query
        ? projects.filter((project) => {
          const docsText = project.docs.map((doc) => `${doc.filename || ''} ${doc.content || ''}`).join(' ');
          const haystack = `${project.name || ''} ${project.creatorName || ''} ${project.description || ''} ${project.raw?.prompt_template || ''} ${docsText}`.toLowerCase();
          return haystack.includes(query.toLowerCase());
        })
        : projects;
      const content = `<section class="split">
        <aside class="side">
          <div class="side-head">
            <h2>项目档案</h2>
            <div class="muted">${escapeHtml(String(filteredProjects.length))} 个</div>
          </div>
          <div class="side-body"><div class="list">${renderProjects(filteredProjects)}</div></div>
        </aside>
        ${renderWorkflowPanel({
          title: '项目工作区',
          body: '项目页先展示可检索的档案目录，docs 和长说明放到详情页加载，适合快速扫一遍项目结构。',
          steps: [
            query ? `当前正在搜索：${query}` : '搜索项目名、创建者、说明或项目提示词',
            '点击项目进入完整 docs 详情',
            '回到对话页可继续按项目名搜索相关会话'
          ],
          actions: '<a class="action action--solid" href="/conversations">查看对话</a><a class="action" href="/api/projects">项目 JSON</a>'
        })}
      </section>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue - Projects',
        heading: '项目',
        subtitle: '把官方导出里的项目文档单独拆出来，便于查看每个项目的说明和 docs。',
        content,
        backHref: '/',
        backLabel: '返回概览',
        query,
        searchAction: '/projects',
        searchPlaceholder: '搜索项目名',
        searchName: 'q'
      }));
      return;
    }

    if (pathname.startsWith('/project/')) {
      const projectId = decodeURIComponent(pathname.replace('/project/', ''));
      const project = getProject(database, projectId);
      const content = `<section class="main">
        <div class="main-head">
          <h2>项目详情</h2>
          <div class="muted">只看这一项的完整信息</div>
        </div>
        <div class="main-body">${renderProjectDetail(project)}</div>
      </section>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue - Project',
        heading: project?.name || '项目详情',
        subtitle: '项目档案的完整视图。',
        content,
        backHref: '/projects',
        backLabel: '返回项目列表',
        query: '',
        searchAction: '/projects',
        searchPlaceholder: '搜索项目名',
        searchName: 'q'
      }));
      return;
    }

    if (pathname.startsWith('/conversation/')) {
      const conversationId = decodeURIComponent(pathname.replace('/conversation/', ''));
      const conversation = getConversation(database, conversationId);
      const content = `<section class="main">
        <div class="main-head">
          <h2>对话详情</h2>
          <div class="footer-actions" style="margin-top:0">
            ${conversation ? `<a class="action action--solid" href="/export/${encodeURIComponent(conversation.id)}">导出本条</a>` : ''}
            <a class="action" href="/conversations">返回列表</a>
          </div>
        </div>
        <div class="main-body">${renderConversationDetail(conversation)}</div>
      </section>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderListPage({
        title: 'Claude History Rescue - Conversation',
        heading: conversation?.title || '对话详情',
        subtitle: '逐条查看消息内容，再决定是否导出或继续使用。',
        content,
        backHref: '/conversations',
        backLabel: '返回对话列表',
        query: '',
        searchAction: '/conversations',
        searchPlaceholder: '搜索对话标题、正文或项目名',
        searchName: 'q'
      }));
      return;
    }

    const conversations = listConversations(database, { q: query, limit: 500, offset: 0 });
    const activeId = conversations[0]?.id || '';
    const activeConversation = activeId ? getConversation(database, activeId) : null;
    const sidebar = renderConversationList(conversations, activeId, query);
    const projectSidebar = renderProjects(projects);
    const main = renderConversationDetail(activeConversation);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderLayout({
      title: 'Claude History Rescue',
      sidebar,
      main,
      searchTerm: query,
      statusMessage,
      summaryCards,
      projects: projectSidebar
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
