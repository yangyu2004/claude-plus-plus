import { escapeHtml, formatDate, formatRelativeCount } from '../core.js';

function icon(name) {
  const icons = {
    spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0l1.8 4.2L14 6l-4.2 1.8L8 12 6.2 7.8 2 6l4.2-1.8L8 0Z" fill="currentColor"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 9.6h-.6l-.2-.2A4.9 4.9 0 1 0 10.6 8l.2.2v.6l3.8 3.8-1.2 1.2-3.8-3.8ZM6.6 10A3.4 3.4 0 1 1 6.6 3.2 3.4 3.4 0 0 1 6.6 10Z" fill="currentColor"/></svg>',
    upload: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 4.5 5h2.3v4.1h2.4V5h2.3L8 1.5ZM3 12.5h10v1.5H3v-1.5Z" fill="currentColor"/></svg>',
    download: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.2 1h1.6v6.2l2.3-2.3 1.1 1.1-4.2 4.2-4.2-4.2 1.1-1.1 2.3 2.3V1ZM2 13h12v1.5H2V13Z" fill="currentColor"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.7 2.7 14 7l-4.3 4.3-1.1-1.1 2.5-2.5H2V6.2h9.1L8.6 3.8l1.1-1.1Z" fill="currentColor"/></svg>',
    grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" fill="currentColor"/></svg>',
    shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 13 3.1v4.1c0 3.5-2.2 6.4-5 7.6-2.8-1.2-5-4.1-5-7.6V3.1L8 1.2Zm0 2L4.4 4.5v2.7c0 2.6 1.6 4.9 3.6 5.9 2-1 3.6-3.3 3.6-5.9V4.5L8 3.2Z" fill="currentColor"/></svg>',
    pulse: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 9h3l1.3-4.4 2.2 6.8 1.7-3.2H15v1.5H9.1L7.6 12 5.4 5.2 4.1 9H1V9Z" fill="currentColor"/></svg>'
  };
  return icons[name] || icons.spark;
}

function actionLink({ href, label, iconName = 'arrow', variant = 'ghost' }) {
  return `<a class="action action--${variant}" href="${escapeHtml(href)}">${icon(iconName)}<span>${escapeHtml(label)}</span></a>`;
}

function renderTopbar(title) {
  return `<header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="brand-copy">
        <div class="brand-name">${escapeHtml(title)}</div>
        <div class="brand-sub">Claude export recovery console</div>
      </div>
    </div>
    <nav class="topnav" aria-label="Primary">
      ${actionLink({ href: '/', label: '概览', iconName: 'grid' })}
      ${actionLink({ href: '/conversations', label: '对话', iconName: 'search' })}
      ${actionLink({ href: '/projects', label: '项目', iconName: 'pulse' })}
      ${actionLink({ href: '/stats', label: '统计', iconName: 'pulse' })}
      ${actionLink({ href: '/export/all', label: '导出全部', iconName: 'download', variant: 'solid' })}
    </nav>
  </header>`;
}

function renderHero({ searchTerm, statusMessage }) {
  return `<section class="hero">
    <div class="hero-copy">
      <div class="hero-badge">
        ${icon('shield')}
        <span>官方导出 · 服务器记录 · 桌面与网页版统一恢复</span>
      </div>
      <h1>
        <span>概览、检索、恢复</span>
        <span>三个步骤直达结果。</span>
      </h1>
      <p>导入官方导出 ZIP 后，页面会自动整理为概览、对话、项目三层结构。你先看状态，再搜内容，最后点进详情恢复上下文。信息少一点，路径短一点，事情就更快完成。</p>
      <div class="hero-actions">
        ${actionLink({ href: '/conversations', label: '看对话', iconName: 'search', variant: 'solid' })}
        ${actionLink({ href: '/projects', label: '看项目', iconName: 'grid' })}
        ${actionLink({ href: '/export/all', label: '导出全部', iconName: 'download' })}
      </div>
      <div class="hero-points" aria-hidden="true">
        <span>先看状态</span>
        <span>再做搜索</span>
        <span>最后进入详情</span>
      </div>
      <div class="hero-stats" aria-hidden="true">
        <div>
          <strong>概览</strong>
          <span>总量、项目、记忆一屏可见</span>
        </div>
        <div>
          <strong>对话</strong>
          <span>按标题、正文、项目名检索</span>
        </div>
        <div>
          <strong>详情</strong>
          <span>逐条查看完整上下文</span>
        </div>
      </div>
    </div>
    <div class="hero-visual" aria-label="Import and search panel">
      <div class="hero-visual__top">
        <div>
          <strong>Quick actions</strong>
          <div class="muted">概览、搜索、导入、导出</div>
        </div>
        <div class="status-pill">${statusMessage ? escapeHtml(statusMessage) : 'Ready'}</div>
      </div>
      <div class="hero-diagram" aria-hidden="true">
        <div class="hero-diagram__core">
          <span>Archive</span>
          <strong>入口</strong>
        </div>
        <div class="hero-diagram__node hero-diagram__node--left">
          <span>List</span>
          <strong>对话</strong>
        </div>
        <div class="hero-diagram__node hero-diagram__node--right">
          <span>Project</span>
          <strong>项目</strong>
        </div>
        <div class="hero-diagram__node hero-diagram__node--bottom">
          <span>Detail</span>
          <strong>详情</strong>
        </div>
        <div class="hero-diagram__ring hero-diagram__ring--outer"></div>
        <div class="hero-diagram__ring hero-diagram__ring--inner"></div>
        <div class="hero-diagram__rail hero-diagram__rail--top"></div>
        <div class="hero-diagram__rail hero-diagram__rail--bottom"></div>
      </div>
      <form id="search-form" method="get" action="/" class="search-shell">
        <label class="field-label" for="search-box">Search</label>
        <div class="search-row">
          <input id="search-box" type="search" name="q" value="${escapeHtml(searchTerm || '')}" placeholder="直接搜索标题、正文、项目名" />
          <button class="action action--solid" type="submit">${icon('search')}<span>搜索</span></button>
        </div>
      </form>
      <form id="import-form" class="import-shell">
        <label class="field-label" for="archive-file">Import</label>
        <div class="import-row">
          <input id="archive-file" type="file" name="archive" accept=".zip,.json,.jsonl,.ndjson,.txt" />
          <button class="action action--solid" type="submit">${icon('upload')}<span>导入</span></button>
        </div>
      </form>
    </div>
  </section>`;
}

function renderFeatureStrip() {
  const features = [
    { label: '恢复速度', value: 'ZIP / JSON 直导', hint: '直接把官方导出整理回可用视图', iconName: 'shield' },
    { label: '检索能力', value: '标题 / 正文 / 项目', hint: '适合从大批量记录里找上下文', iconName: 'search' },
    { label: '继续工作', value: '续写提示生成', hint: '把旧会话整理成新的起点', iconName: 'spark' },
    { label: '结果输出', value: 'Markdown 导出', hint: '直接拿到可复制的文本档案', iconName: 'download' }
  ];

  return `<section class="feature-strip" aria-label="Capabilities">
    ${features.map((feature) => `<article class="feature-card">
      <div class="feature-card__icon">${icon(feature.iconName)}</div>
      <div class="feature-card__label">${escapeHtml(feature.label)}</div>
      <div class="feature-card__value">${escapeHtml(feature.value)}</div>
      <div class="feature-card__hint">${escapeHtml(feature.hint)}</div>
    </article>`).join('')}
  </section>`;
}

function renderSummaryCards(summaryCards) {
  return `<section class="metrics" aria-label="Archive metrics">
    ${summaryCards.map((card) => `
      <article class="metric-card">
        <div class="metric-card__label">${escapeHtml(card.label)}</div>
        <div class="metric-card__value">${escapeHtml(card.value)}</div>
        <div class="metric-card__hint">${escapeHtml(card.hint || '')}</div>
      </article>
    `).join('')}
  </section>`;
}

function renderOverviewPanel({ summaryCards, statusMessage, query }) {
  return `<section class="overview-panel">
    <div class="overview-panel__head">
      <div>
        <div class="detail-kicker">Overview</div>
        <h2>一眼看清状态</h2>
      </div>
      <div class="detail-meta">${statusMessage ? escapeHtml(statusMessage) : '准备导入、搜索或继续查看现有数据'}</div>
    </div>
    <div class="overview-grid">
      ${summaryCards.map((card) => `
        <article class="overview-card">
          <div class="overview-card__label">${escapeHtml(card.label)}</div>
          <div class="overview-card__value">${escapeHtml(card.value)}</div>
          <div class="overview-card__hint">${escapeHtml(card.hint || '')}</div>
        </article>
      `).join('')}
    </div>
    <div class="overview-actions">
      ${actionLink({ href: query ? `/conversations?q=${encodeURIComponent(query)}` : '/conversations', label: query ? `看“${query}”相关对话` : '看全部对话', iconName: 'search', variant: 'solid' })}
      ${actionLink({ href: '/projects', label: '看项目档案', iconName: 'grid' })}
      ${actionLink({ href: '/export/all', label: '导出全部', iconName: 'download' })}
    </div>
  </section>`;
}

export function renderListPage({ title, heading, subtitle, content, backHref = '/', backLabel = '返回概览', query = '', searchAction = '/', searchPlaceholder = '搜索', searchName = 'q', emptyHint = '' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #03060d;
      --surface-strong: rgba(10, 15, 24, 0.95);
      --line: rgba(255, 255, 255, 0.08);
      --line-strong: rgba(255, 255, 255, 0.14);
      --text: #f5f8fc;
      --muted: rgba(245, 248, 252, 0.68);
      --accent: #4ce1d2;
      --shadow: 0 28px 72px rgba(0, 0, 0, 0.36);
    }
    html, body { margin: 0; min-height: 100%; color: var(--text); font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: linear-gradient(180deg, #09131f 0%, #050913 42%, #03060d 100%); }
    * { box-sizing: border-box; }
    a { color: inherit; }
    button, input { font: inherit; }
    .page { min-height: 100vh; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; width:min(100%,1320px); margin:0 auto; padding:18px 22px 0; }
    .brand { display:flex; align-items:center; gap:12px; min-width:0; }
    .brand-mark { width:40px; height:40px; border-radius:8px; background: linear-gradient(135deg, rgba(76,225,210,0.96), rgba(246,200,106,0.9)); box-shadow: 0 16px 34px rgba(0,0,0,0.3); }
    .brand-copy { min-width:0; display:grid; gap:2px; }
    .brand-name { font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .brand-sub { font-size:12px; color:var(--muted); }
    .topnav { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; }
    .action { appearance:none; -webkit-appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:auto; min-width:112px; height:42px; padding:0 14px; border-radius:8px; border:1px solid var(--line); text-decoration:none; background:rgba(255,255,255,0.03); color:var(--text); line-height:1; white-space:nowrap; flex:none; cursor:pointer; }
    .action svg { width:15px; height:15px; flex:none; }
    .action span { white-space:nowrap; }
    .topnav .action { width:104px; min-width:104px; padding:0 10px; }
    .search-row .action, .import-inline .action { width:112px; }
    .action--solid { border-color:transparent; color:#041018; background:linear-gradient(135deg, rgba(76,225,210,0.98), rgba(246,200,106,0.94)); font-weight:700; }
    .landing { width:100%; padding:18px 22px 32px; display:grid; gap:18px; }
    .panel { border:1px solid var(--line); background:var(--surface-strong); box-shadow:var(--shadow); border-radius:8px; overflow:hidden; }
    .panel__head { padding:18px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .panel__head h1, .panel__head h2 { margin:0; }
    .panel__head h1 { font-size:28px; line-height:1.1; }
    .panel__head p { margin:8px 0 0; color:var(--muted); font-size:14px; line-height:1.7; max-width:60ch; }
    .panel__body { padding:20px; }
    .muted { color: var(--muted); font-size:12px; line-height:1.5; }
    .search-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; }
    input[type="search"], input[type="file"] { width:100%; min-width:0; height:42px; color:var(--text); background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:0 14px; outline:none; }
    input[type="search"]::placeholder { color: rgba(245,248,252,0.38); }
    input[type="search"]:focus-visible, input[type="file"]:focus-visible { border-color: rgba(76,225,210,0.62); box-shadow: 0 0 0 3px rgba(76,225,210,0.12); }
    input[type="file"]::file-selector-button { margin-right:12px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px; background:rgba(255,255,255,0.06); color:var(--text); cursor:pointer; }
    .overview-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
    .overview-card { padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
    .overview-card__label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0; }
    .overview-card__value { margin-top:12px; font-size:20px; font-weight:700; }
    .overview-card__hint { margin-top:8px; color:var(--muted); font-size:12px; line-height:1.5; }
    .overview-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    .list { display:grid; gap:10px; }
    .entry { display:block; padding:15px 18px; border:1px solid var(--line); border-radius:8px; text-decoration:none; color:inherit; background:rgba(255,255,255,0.02); }
    .entry:hover, .entry:focus-visible, .entry--active { background:rgba(76,225,210,0.06); border-color:var(--line-strong); outline:none; }
    .entry__top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .entry h3 { margin:0; font-size:14px; line-height:1.35; }
    .entry__meta { margin-top:6px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0; }
    .entry__preview { margin-top:6px; color:var(--muted); font-size:12px; line-height:1.6; white-space:pre-wrap; }
    .split { display:grid; grid-template-columns: 320px minmax(0,1fr); gap:16px; }
    .side, .main { border:1px solid var(--line); background:var(--surface-strong); border-radius:8px; box-shadow:var(--shadow); overflow:hidden; }
    .side-head, .main-head { padding:16px 18px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .side-body, .main-body { padding:16px; }
    .detail-panel { padding:20px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,0.02); }
    .detail-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding-bottom:16px; border-bottom:1px solid var(--line); margin-bottom:16px; }
    .detail-head h2 { margin:6px 0 0; font-size:28px; line-height:1.08; }
    .detail-meta { color:var(--muted); font-size:12px; line-height:1.5; text-align:right; max-width:48ch; }
    .detail-block { padding:16px 0; border-top:1px solid var(--line); }
    .detail-copy, .message__content { white-space:pre-wrap; line-height:1.8; font-size:14px; color:rgba(244,247,255,0.94); }
    .message { padding:16px 0; border-top:1px solid var(--line); }
    .message:first-of-type { border-top:0; padding-top:4px; }
    .message__role { display:inline-flex; padding:4px 8px; border-radius:8px; border:1px solid rgba(76,225,210,0.16); background:rgba(76,225,210,0.08); color:var(--accent); text-transform:uppercase; letter-spacing:0; font-size:11px; }
    .message time { display:block; margin:10px 0 8px; color:var(--muted); font-size:12px; }
    .empty-state, .empty-stage { padding:26px; color:var(--muted); font-size:14px; line-height:1.7; border:1px dashed rgba(255,255,255,0.12); border-radius:8px; background:rgba(255,255,255,0.02); }
    .footer-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    .import-inline { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
    .home-grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:16px; }
    .home-grid > .panel:last-child { grid-column: 1 / -1; }
    .workflow { display:grid; gap:16px; }
    .workflow-card { padding:18px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,0.02); }
    .workflow-card h3 { margin:0; font-size:16px; }
    .workflow-card p { margin:8px 0 0; color:var(--muted); font-size:13px; line-height:1.7; }
    .workflow-steps { display:grid; gap:10px; margin-top:14px; }
    .workflow-step { display:grid; grid-template-columns:28px minmax(0,1fr); gap:10px; align-items:start; color:rgba(244,247,255,0.9); font-size:13px; line-height:1.6; }
    .workflow-step span:first-child { display:grid; place-items:center; width:28px; height:28px; border-radius:8px; color:#041018; background:var(--accent); font-weight:700; }
    .pagination { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
    .pagination__meta { color:var(--muted); font-size:12px; margin-right:auto; }
    .overview-panel { display:grid; gap:16px; }
    .overview-panel__head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .overview-panel__head h2 { margin:0; font-size:20px; }
    .overview-grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; }
    .overview-card { padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
    .overview-card__label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:0; }
    .overview-card__value { margin-top:12px; font-size:20px; font-weight:700; }
    .overview-card__hint { margin-top:8px; color:var(--muted); font-size:12px; line-height:1.5; }
    .overview-actions { display:flex; flex-wrap:wrap; gap:10px; }
    @media (max-width: 1120px) { .overview-grid, .split, .home-grid { grid-template-columns:1fr; } .home-grid > .panel:last-child { grid-column:auto; } }
    @media (max-width: 760px) { .topbar, .landing { padding-left:14px; padding-right:14px; } .topbar { flex-direction:column; align-items:stretch; } .topnav { justify-content:flex-start; } .topnav .action { flex:1 1 calc(50% - 5px); width:auto; min-width:0; } .search-row, .split, .import-inline { grid-template-columns:1fr; } .search-row .action, .import-inline .action { width:100%; min-width:0; } .footer-actions .action { flex:1 1 112px; } .panel__head { flex-direction:column; } .detail-head { flex-direction:column; } .detail-meta { text-align:left; } }
  </style>
</head>
<body>
  <div class="page">
    ${renderTopbar(title)}
    <main class="landing">
      <section class="panel">
        <div class="panel__head">
          <div>
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="muted">${query ? `Query: ${escapeHtml(query)}` : ''}</div>
        </div>
        <div class="panel__body">
          <form id="search-form" method="get" action="${escapeHtml(searchAction)}">
            <div class="search-row">
              <input id="search-box" type="search" name="${escapeHtml(searchName)}" value="${escapeHtml(query)}" placeholder="${escapeHtml(searchPlaceholder)}" />
              <button class="action action--solid" type="submit">${icon('search')}<span>搜索</span></button>
            </div>
          </form>
          <div class="footer-actions">
            ${actionLink({ href: backHref, label: backLabel, iconName: 'arrow' })}
            ${actionLink({ href: '/stats', label: '查看统计', iconName: 'pulse' })}
            ${actionLink({ href: '/export/all', label: '导出全部', iconName: 'download' })}
          </div>
          <form id="import-form" class="import-inline">
            <input id="archive-file" type="file" name="archive" accept=".zip,.json,.jsonl,.ndjson,.txt" />
            <button class="action action--solid" type="submit">${icon('upload')}<span>导入</span></button>
          </form>
        </div>
      </section>
      ${content}
    </main>
  </div>
  <script>
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const searchInput = searchForm.querySelector('input[type="search"]');
        const target = new URL(searchForm.getAttribute('action') || window.location.pathname, window.location.origin);
        if (searchInput.value) target.searchParams.set('${searchName}', searchInput.value);
        else target.searchParams.delete('${searchName}');
        window.location.href = target.toString();
      });
    }

    const form = document.getElementById('import-form');
    if (form) {
      form.addEventListener('submit', async (event) => {
        const fileInput = form.querySelector('input[type="file"]');
        if (!fileInput.files || fileInput.files.length === 0) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const file = fileInput.files[0];
        const response = await fetch('/import', {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name)
          },
          body: await file.arrayBuffer()
        });
        if (!response.ok) {
          alert(await response.text());
          return;
        }
        window.location.href = '/';
      });
    }
  </script>
</body>
</html>`;
}

export function renderWorkflowPanel({ title, body, steps = [], actions = '' }) {
  return `<section class="main">
    <div class="main-head">
      <h2>${escapeHtml(title)}</h2>
      <div class="muted">高频操作</div>
    </div>
    <div class="main-body">
      <div class="workflow">
        <article class="workflow-card">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(body)}</p>
          <div class="workflow-steps">
            ${steps.map((step, index) => `<div class="workflow-step"><span>${index + 1}</span><span>${escapeHtml(step)}</span></div>`).join('')}
          </div>
          ${actions ? `<div class="footer-actions">${actions}</div>` : ''}
        </article>
      </div>
    </div>
  </section>`;
}

export function renderPagination({ basePath, query = '', page = 1, hasNext = false, pageSize = 80, itemCount = 0 }) {
  const search = new URLSearchParams();
  if (query) search.set('q', query);
  const hrefForPage = (targetPage) => {
    const params = new URLSearchParams(search);
    if (targetPage > 1) params.set('page', String(targetPage));
    else params.delete('page');
    const suffix = params.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };
  const start = itemCount === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = ((page - 1) * pageSize) + itemCount;

  return `<nav class="pagination" aria-label="Pagination">
    <div class="pagination__meta">第 ${escapeHtml(String(page))} 页 · 当前显示 ${escapeHtml(String(start))}-${escapeHtml(String(end))}</div>
    ${page > 1 ? actionLink({ href: hrefForPage(page - 1), label: '上一页', iconName: 'arrow' }) : ''}
    ${hasNext ? actionLink({ href: hrefForPage(page + 1), label: '下一页', iconName: 'arrow', variant: 'solid' }) : ''}
  </nav>`;
}

export function renderConversationList(conversations, activeId, query) {
  if (conversations.length === 0) {
    return `<div class="empty-state">没有匹配到对话${query ? `：${escapeHtml(query)}` : ''}</div>`;
  }

  return conversations.map((conversation) => {
    const isActive = conversation.id === activeId;
    return `<a class="entry${isActive ? ' entry--active' : ''}" href="/conversation/${encodeURIComponent(conversation.id)}">
      <div class="entry__top">
        <h3>${escapeHtml(conversation.title)}</h3>
        <span class="entry__arrow">${icon('arrow')}</span>
      </div>
      <div class="entry__meta">${escapeHtml(formatRelativeCount(conversation.messageCount))}${conversation.projectName ? ` · ${escapeHtml(conversation.projectName)}` : ''}${conversation.updatedAt ? ` · ${escapeHtml(formatDate(conversation.updatedAt))}` : ''}</div>
      <div class="entry__preview">${escapeHtml((conversation.lastMessage || '').slice(0, 240))}</div>
    </a>`;
  }).join('');
}

export function renderProjects(projects, activeProjectId = '') {
  if (projects.length === 0) {
    return '<div class="empty-state">没有项目档案</div>';
  }

  return projects.map((project) => {
    const isActive = project.uuid === activeProjectId;
    return `<a class="entry${isActive ? ' entry--active' : ''}" href="/project/${encodeURIComponent(project.uuid)}">
      <div class="entry__top">
        <h3>${escapeHtml(project.name)}</h3>
        <span class="entry__arrow">${icon('arrow')}</span>
      </div>
      <div class="entry__meta">${escapeHtml(String(project.docs.length))} docs${project.creatorName ? ` · ${escapeHtml(project.creatorName)}` : ''}</div>
      <div class="entry__preview">${escapeHtml((project.description || project.raw.prompt_template || '').slice(0, 240))}</div>
    </a>`;
  }).join('');
}

export { renderSummaryCards };

export function renderProjectDetail(project) {
  if (!project) {
    return '<div class="empty-stage">选择左侧的项目档案查看详情。</div>';
  }

  return `<article class="detail-panel">
    <div class="detail-head">
      <div>
        <div class="detail-kicker">Project archive</div>
        <h2>${escapeHtml(project.name)}</h2>
      </div>
      <div class="detail-meta">UUID: ${escapeHtml(project.uuid)}${project.creatorName ? ` · ${escapeHtml(project.creatorName)}` : ''}</div>
    </div>
    ${project.description ? `<div class="detail-block"><div class="detail-copy">${escapeHtml(project.description)}</div></div>` : ''}
    ${project.docs.map((doc) => `
      <div class="detail-block">
        <div class="detail-block__label">doc</div>
        <div class="detail-copy"><strong>${escapeHtml(doc.filename)}</strong>\n\n${escapeHtml(doc.content || '')}</div>
      </div>
    `).join('')}
  </article>`;
}

export function renderConversationDetail(conversation) {
  if (!conversation) {
    return '<div class="empty-stage">选择左侧的一段对话开始查看。</div>';
  }

  return `<article class="detail-panel">
    <div class="detail-head">
      <div>
        <div class="detail-kicker">Conversation</div>
        <h2>${escapeHtml(conversation.title)}</h2>
      </div>
      <div class="detail-meta">ID: ${escapeHtml(conversation.id)} · ${escapeHtml(formatRelativeCount(conversation.messages.length))}${conversation.projectName ? ` · ${escapeHtml(conversation.projectName)}` : ''}</div>
    </div>
    ${conversation.messages.map((message) => `
      <div class="message">
        <div class="message__role">${escapeHtml(message.role || 'unknown')}</div>
        ${message.created_at || message.createdAt ? `<time>${escapeHtml(formatDate(message.created_at || message.createdAt))}</time>` : ''}
        <div class="message__content">${escapeHtml(message.content || '')}</div>
      </div>
    `).join('')}
  </article>`;
}

export function renderLayout({ title, sidebar, main, searchTerm, statusMessage, summaryCards, projects, hero }) {
  const heroMarkup = hero || renderHero({ searchTerm, statusMessage });
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #03060d;
      --bg2: #071019;
      --surface: rgba(12, 18, 28, 0.82);
      --surface-strong: rgba(10, 15, 24, 0.95);
      --line: rgba(255, 255, 255, 0.08);
      --line-strong: rgba(255, 255, 255, 0.14);
      --text: #f5f8fc;
      --muted: rgba(245, 248, 252, 0.68);
      --accent: #4ce1d2;
      --accent-2: #f6c86a;
      --accent-3: #81e49e;
      --shadow: 0 28px 72px rgba(0, 0, 0, 0.36);
    }
    html { scroll-behavior: smooth; }
    html, body {
      margin: 0;
      min-height: 100%;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        linear-gradient(180deg, #09131f 0%, #050913 42%, #03060d 100%),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 126px),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 126px);
    }
    body {
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(112deg, transparent 0 33%, rgba(76, 225, 210, 0.08) 33% 34.5%, transparent 34.5% 100%),
        linear-gradient(205deg, transparent 0 62%, rgba(246, 200, 106, 0.06) 62% 63.5%, transparent 63.5% 100%);
    }
    * { box-sizing: border-box; }
    a { color: inherit; }
    button, input { font: inherit; }
    .page {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      width: min(100%, 1320px);
      margin: 0 auto;
      padding: 18px 22px 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .brand-mark {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.14);
      background:
        linear-gradient(135deg, rgba(76,225,210,0.96), rgba(246,200,106,0.9));
      box-shadow: 0 16px 34px rgba(0,0,0,0.3);
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
    }
    .brand-mark span {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent 0 33%, rgba(255,255,255,0.35) 33% 38%, transparent 38% 100%);
      transform: translateX(-65%);
      animation: sweep 7s linear infinite;
    }
    .brand-copy { min-width: 0; display: grid; gap: 2px; }
    .brand-name { font-size: 15px; font-weight: 700; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .brand-sub { font-size: 12px; color: var(--muted); }
    .topnav {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
    }
    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--line);
      text-decoration: none;
      background: rgba(255,255,255,0.03);
      color: var(--text);
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    .action svg { width: 15px; height: 15px; flex: none; }
    .action:hover, .action:focus-visible {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: rgba(255,255,255,0.06);
      outline: none;
    }
    .action--solid {
      border-color: transparent;
      color: #041018;
      background: linear-gradient(135deg, rgba(76,225,210,0.98), rgba(246,200,106,0.94));
      box-shadow: 0 18px 34px rgba(76, 225, 210, 0.16);
      font-weight: 700;
    }
    .landing {
      width: 100%;
      padding: 18px 22px 32px;
      display: grid;
      gap: 18px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(360px, 440px);
      gap: 18px;
      align-items: stretch;
      min-height: 620px;
    }
    .hero-copy, .hero-visual, .feature-card, .metric-card, .entry, .detail-panel, .empty-stage {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(16, 24, 36, 0.9), rgba(9, 13, 22, 0.94));
      box-shadow: var(--shadow);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .hero-copy {
      border-radius: 24px;
      padding: 54px 48px 36px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }
    .hero-copy::before {
      content: "";
      position: absolute;
      inset: 16% -8% auto auto;
      width: 58%;
      height: 68%;
      background: linear-gradient(140deg, rgba(76,225,210,0.1), transparent 55%, rgba(246,200,106,0.08));
      clip-path: polygon(18% 0, 100% 0, 88% 100%, 0 100%);
      pointer-events: none;
      z-index: -1;
    }
    .hero-copy::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -16%;
      width: 92%;
      height: 52%;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(76,225,210,0.14), transparent 68%);
      transform: translateX(-50%);
      pointer-events: none;
      z-index: -1;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.09);
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      font-size: 12px;
      position: relative;
      z-index: 1;
    }
    .hero-badge svg { width: 14px; height: 14px; color: var(--accent); }
    .hero-copy h1 {
      margin: 22px 0 14px;
      max-width: 12ch;
      position: relative;
      z-index: 1;
      font-size: clamp(48px, 5.2vw, 88px);
      line-height: 0.92;
      letter-spacing: 0;
      display: grid;
      gap: 4px;
    }
    .hero-copy h1 span { display: block; }
    .hero-copy p {
      margin: 0;
      max-width: 54ch;
      position: relative;
      z-index: 1;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.82;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 30px;
      position: relative;
      z-index: 1;
    }
    .hero-points {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 22px;
      position: relative;
      z-index: 1;
    }
    .hero-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 28px;
      position: relative;
      z-index: 1;
    }
    .hero-stats div {
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
    }
    .hero-stats strong {
      display: block;
      font-size: 22px;
      line-height: 1;
    }
    .hero-stats span {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .hero-points span, .status-pill {
      padding: 7px 10px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      font-size: 12px;
    }
    .hero-visual {
      border-radius: 24px;
      padding: 24px;
      display: grid;
      gap: 14px;
      position: relative;
      overflow: hidden;
    }
    .hero-visual::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.025), transparent 24%),
        repeating-linear-gradient(180deg, transparent 0 60px, rgba(255,255,255,0.032) 60px 61px);
      pointer-events: none;
    }
    .hero-visual__top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      position: relative;
      z-index: 1;
    }
    .hero-visual__top strong {
      display: block;
      font-size: 15px;
      margin-bottom: 4px;
    }
    .hero-diagram {
      position: relative;
      min-height: 256px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.08);
      background:
        radial-gradient(circle at 50% 50%, rgba(76,225,210,0.18), transparent 24%),
        radial-gradient(circle at 50% 50%, rgba(246,200,106,0.14), transparent 38%),
        rgba(255,255,255,0.025);
      overflow: hidden;
      z-index: 1;
    }
    .hero-diagram::before,
    .hero-diagram::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .hero-diagram::before {
      background:
        linear-gradient(90deg, transparent 0 49.5%, rgba(255,255,255,0.08) 49.5% 50.5%, transparent 50.5% 100%),
        linear-gradient(180deg, transparent 0 49.5%, rgba(255,255,255,0.08) 49.5% 50.5%, transparent 50.5% 100%);
      opacity: 0.55;
      mask-image: radial-gradient(circle at 50% 50%, black 0 58%, transparent 85%);
    }
    .hero-diagram::after {
      background: radial-gradient(circle at 50% 50%, transparent 0 33%, rgba(255,255,255,0.06) 33% 33.5%, transparent 33.5% 100%);
      opacity: 0.85;
    }
    .hero-diagram__ring {
      position: absolute;
      inset: 50% auto auto 50%;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .hero-diagram__ring--outer {
      width: 72%;
      aspect-ratio: 1;
      background: radial-gradient(circle, rgba(76,225,210,0.06), transparent 70%);
    }
    .hero-diagram__ring--inner {
      width: 44%;
      aspect-ratio: 1;
      border-color: rgba(76,225,210,0.18);
      box-shadow: inset 0 0 0 1px rgba(246,200,106,0.08);
    }
    .hero-diagram__rail {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 68%;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(76,225,210,0.72), transparent);
      transform: translate(-50%, -50%);
      opacity: 0.85;
    }
    .hero-diagram__rail--top { transform: translate(-50%, -50%) rotate(-26deg); }
    .hero-diagram__rail--bottom { transform: translate(-50%, -50%) rotate(26deg); }
    .hero-diagram__rail::before,
    .hero-diagram__rail::after {
      content: "";
      position: absolute;
      top: -1px;
      width: 30px;
      height: 3px;
      border-radius: 999px;
      background: rgba(246,200,106,0.95);
      box-shadow: 0 0 18px rgba(246,200,106,0.35);
    }
    .hero-diagram__rail::before { left: 10%; }
    .hero-diagram__rail::after { right: 12%; }
    .hero-diagram__node, .hero-diagram__core {
      position: absolute;
      display: grid;
      gap: 3px;
      padding: 10px 12px;
      min-width: 88px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(8, 13, 22, 0.82);
      box-shadow: 0 12px 26px rgba(0,0,0,0.28);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 1;
    }
    .hero-diagram__node span, .hero-diagram__core span {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .hero-diagram__node strong, .hero-diagram__core strong {
      font-size: 18px;
      line-height: 1;
    }
    .hero-diagram__core {
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      min-width: 132px;
      align-items: center;
      text-align: center;
      border-color: rgba(76,225,210,0.36);
      background: linear-gradient(180deg, rgba(76,225,210,0.16), rgba(8, 13, 22, 0.88));
      box-shadow: 0 0 0 1px rgba(76,225,210,0.1), 0 20px 36px rgba(0,0,0,0.34);
    }
    .hero-diagram__node--left { left: 14px; top: 18px; }
    .hero-diagram__node--right { right: 14px; top: 18px; }
    .hero-diagram__node--bottom { left: 50%; bottom: 16px; transform: translateX(-50%); }
    .muted { color: var(--muted); font-size: 12px; line-height: 1.5; }
    .search-shell, .import-shell {
      display: grid;
      gap: 8px;
      position: relative;
      z-index: 1;
    }
    .field-label {
      font-size: 12px;
      color: var(--muted);
      letter-spacing: 0.02em;
    }
    .search-row, .import-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }
    input[type="search"], input[type="file"] {
      width: 100%;
      min-width: 0;
      color: var(--text);
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 12px 14px;
      outline: none;
    }
    input[type="search"]:focus-visible, input[type="file"]:focus-visible {
      border-color: rgba(76,225,210,0.62);
      box-shadow: 0 0 0 3px rgba(76,225,210,0.12);
    }
    input[type="file"]::file-selector-button {
      margin-right: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.06);
      color: var(--text);
      cursor: pointer;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      position: relative;
      z-index: 1;
      margin-top: auto;
    }
    .hero-card {
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      padding: 14px;
      min-height: 108px;
    }
    .hero-card__label, .feature-card__label, .metric-card__label, .entry__meta, .detail-kicker, .detail-block__label, .message__role {
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 11px;
    }
    .hero-card__label, .feature-card__label, .metric-card__label, .entry__meta, .detail-kicker, .detail-block__label { color: var(--muted); }
    .hero-card__value {
      margin-top: 10px;
      font-size: 18px;
      font-weight: 700;
    }
    .hero-card__hint {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .feature-strip, .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .feature-card, .metric-card {
      border-radius: 14px;
      padding: 16px;
    }
    .feature-card__icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      color: var(--accent);
    }
    .feature-card__icon svg { width: 15px; height: 15px; }
    .feature-card__value, .metric-card__value {
      margin-top: 12px;
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
    }
    .feature-card__hint, .metric-card__hint {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .workspace {
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
      gap: 16px;
      min-height: 0;
    }
    .rail, .main-stage {
      border-radius: 20px;
      border: 1px solid var(--line);
      background: var(--surface-strong);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .rail {
      display: grid;
      grid-template-rows: auto auto 1fr;
      min-height: 0;
    }
    .rail-head, .main-head {
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(255,255,255,0.02);
    }
    .rail-head h2, .main-head h2 {
      margin: 0;
      font-size: 14px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .rail-body {
      overflow: auto;
      min-height: 0;
    }
    .rail-note {
      padding: 14px 18px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    .entry {
      display: block;
      padding: 15px 18px;
      border-left: 3px solid transparent;
      border-bottom: 1px solid var(--line);
      text-decoration: none;
      color: inherit;
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
    }
    .entry:hover, .entry:focus-visible, .entry--active {
      background: rgba(76,225,210,0.06);
      border-left-color: var(--accent);
      outline: none;
    }
    .entry__top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .entry h3 {
      margin: 0;
      font-size: 14px;
      line-height: 1.35;
      max-width: 100%;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .entry__meta {
      margin-top: 6px;
      color: var(--muted);
    }
    .entry__arrow {
      color: var(--muted);
      flex: none;
      opacity: 0;
      transition: opacity 160ms ease, transform 160ms ease;
    }
    .entry:hover .entry__arrow, .entry--active .entry__arrow {
      opacity: 1;
      transform: translateX(1px);
    }
    .entry__arrow svg { width: 14px; height: 14px; }
    .entry__preview {
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-wrap;
    }
    .main-stage {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 0;
    }
    .main-body {
      padding: 20px;
      overflow: auto;
      min-height: 0;
    }
    .detail-panel {
      border-radius: 16px;
      padding: 20px;
      background: rgba(255,255,255,0.02);
    }
    .detail-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 16px;
    }
    .detail-head h2 {
      margin: 6px 0 0;
      font-size: 28px;
      line-height: 1.08;
    }
    .detail-meta {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
      text-align: right;
      max-width: 48ch;
    }
    .detail-block {
      padding: 16px 0;
      border-top: 1px solid var(--line);
    }
    .detail-copy {
      white-space: pre-wrap;
      line-height: 1.8;
      font-size: 14px;
      color: rgba(244,247,255,0.94);
    }
    .message {
      padding: 16px 0;
      border-top: 1px solid var(--line);
    }
    .message:first-of-type {
      border-top: 0;
      padding-top: 4px;
    }
    .message__role {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(76,225,210,0.16);
      background: rgba(76,225,210,0.08);
      color: var(--accent);
    }
    .message time {
      display: block;
      margin: 10px 0 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .message__content {
      white-space: pre-wrap;
      line-height: 1.85;
      font-size: 14px;
      color: rgba(244,247,255,0.92);
    }
    .empty-state, .empty-stage {
      padding: 26px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
    }
    .empty-stage {
      border-radius: 16px;
      border: 1px dashed rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.02);
    }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: 0;
    }
    .skip-link:focus {
      left: 16px;
      top: 16px;
      z-index: 10;
      padding: 10px 12px;
      border-radius: 999px;
      background: #0d162b;
      border: 1px solid rgba(255,255,255,0.16);
    }
    @keyframes sweep {
      from { transform: translateX(-65%); }
      to { transform: translateX(165%); }
    }
    @media (max-width: 1120px) {
      .hero, .workspace, .feature-strip, .metrics {
        grid-template-columns: 1fr;
      }
      .hero { min-height: auto; }
      .hero-copy h1 { max-width: none; }
    }
    @media (max-width: 760px) {
      .topbar, .landing { padding-left: 14px; padding-right: 14px; }
      .topbar { flex-direction: column; align-items: stretch; }
      .topnav { justify-content: flex-start; }
      .hero-copy, .hero-visual, .rail, .main-stage { border-radius: 16px; }
      .hero-copy { padding: 30px 22px 24px; }
      .hero-stats { grid-template-columns: 1fr; }
      .search-row, .import-row, .workspace { grid-template-columns: 1fr; }
      .hero-diagram { min-height: 210px; }
      .detail-head { flex-direction: column; }
      .detail-meta { text-align: left; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#workspace">Skip to workspace</a>
  <div class="page">
    ${renderTopbar(title)}
    <main class="landing">
      ${heroMarkup}
      ${renderFeatureStrip()}
      ${renderSummaryCards(summaryCards)}
      <section class="workspace" id="workspace">
        <aside class="rail">
          <div class="rail-head">
            <h2>Projects</h2>
            ${actionLink({ href: '/api/projects', label: 'JSON', iconName: 'grid' })}
          </div>
          <div class="rail-body">${projects}</div>
          <div class="rail-note">项目档案来自官方导出中的 <code>projects/*.json</code>，可直接查看每个项目的 docs 和说明。</div>
          <div class="rail-head">
            <h2>Conversations</h2>
            ${actionLink({ href: '/api/conversations', label: 'API', iconName: 'pulse' })}
          </div>
          <div class="rail-body">${sidebar}</div>
        </aside>
        <section class="main-stage">
          <div class="main-head">
            <h2>Viewer</h2>
            <div class="muted">HTML · Markdown · Resume prompt</div>
          </div>
          <div class="main-body">${main}</div>
        </section>
      </section>
    </main>
  </div>
  <script>
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const searchInput = searchForm.querySelector('input[type="search"]');
        const target = new URL(window.location.href);
        if (searchInput.value) target.searchParams.set('q', searchInput.value);
        else target.searchParams.delete('q');
        window.location.href = target.toString();
      });
    }

    const form = document.getElementById('import-form');
    if (form) {
      form.addEventListener('submit', async (event) => {
        const fileInput = form.querySelector('input[type="file"]');
        if (!fileInput.files || fileInput.files.length === 0) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const file = fileInput.files[0];
        const response = await fetch('/import', {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name)
          },
          body: await file.arrayBuffer()
        });
        if (!response.ok) {
          alert(await response.text());
          return;
        }
        window.location.reload();
      });
    }
  </script>
</body>
</html>`;
}
