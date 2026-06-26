(() => {
  const STORAGE_KEY = 'chr-api-base';
  const DEFAULT_API_BASE = 'http://127.0.0.1:8789';

  if (window.__chrPanelInjected) return;
  window.__chrPanelInjected = true;

  const root = document.createElement('div');
  root.id = 'chr-root';
  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <div class="chr-shell">
      <div class="chr-header">
        <div class="chr-titlebar">
          <div class="chr-brand">
            <strong>Claude History Rescue</strong>
            <span>本地恢复的对话列表</span>
          </div>
          <button class="chr-button" data-action="collapse" title="收起">−</button>
        </div>
      </div>
      <div class="chr-search">
        <div class="chr-meta">
          <span data-role="status">准备加载</span>
          <a data-role="open-local" href="#" target="_blank" rel="noreferrer">打开本地</a>
        </div>
        <div class="chr-search-row">
          <input type="search" placeholder="搜索标题、正文、项目名" data-role="query" />
          <button class="chr-button" data-action="refresh" title="刷新">↻</button>
        </div>
      </div>
      <div class="chr-list" data-role="list"></div>
      <div class="chr-footer">
        <button class="chr-button" data-action="settings" title="设置接口地址">API</button>
        <button class="chr-button" data-action="open-stats">统计</button>
      </div>
    </div>
  `;

  const state = {
    apiBase: DEFAULT_API_BASE,
    conversations: [],
    filtered: []
  };

  const $ = (selector) => shadow.querySelector(selector);
  const listEl = $('[data-role="list"]');
  const statusEl = $('[data-role="status"]');
  const queryEl = $('[data-role="query"]');
  const openLocalEl = $('[data-role="open-local"]');
  const shell = shadow.querySelector('.chr-shell');

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function localUrl(pathname = '/') {
    return `${state.apiBase.replace(/\/$/, '')}${pathname}`;
  }

  function renderList(items) {
    if (items.length === 0) {
      listEl.innerHTML = '<div class="chr-item"><strong>没有匹配项</strong><span>换个关键词试试</span></div>';
      return;
    }

    listEl.innerHTML = items.map((item) => {
      const title = escapeHtml(item.title || 'Untitled');
      const meta = escapeHtml([
        `${item.messageCount || 0} messages`,
        item.projectName || '',
        item.updatedAt || ''
      ].filter(Boolean).join(' · '));
      const preview = escapeHtml((item.lastMessage || '').slice(0, 160));
      return `
        <a class="chr-item" href="${localUrl(`/conversation/${encodeURIComponent(item.id)}`)}" target="_blank" rel="noreferrer">
          <strong>${title}</strong>
          <span>${meta}</span>
          <span>${preview}</span>
        </a>
      `;
    }).join('');
  }

  function filterList() {
    const q = queryEl.value.trim().toLowerCase();
    state.filtered = q
      ? state.conversations.filter((item) => {
        const haystack = `${item.title || ''} ${item.lastMessage || ''} ${item.projectName || ''}`.toLowerCase();
        return haystack.includes(q);
      })
      : state.conversations;
    renderList(state.filtered);
    setStatus(`${state.filtered.length} 条`);
  }

  async function load(apiBase = state.apiBase) {
    state.apiBase = apiBase;
    openLocalEl.href = localUrl('/');
    setStatus('加载中');
    try {
      const response = await fetch(`${state.apiBase.replace(/\/$/, '')}/api/conversations`, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      state.conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
      filterList();
      setStatus(`${state.filtered.length} 条`);
    } catch (error) {
      listEl.innerHTML = `
        <div class="chr-item">
          <strong>无法连接本地服务</strong>
          <span>${escapeHtml(String(error.message || error))}</span>
        </div>
      `;
      setStatus('离线');
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  shadow.addEventListener('click', (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;

    if (action === 'collapse') {
      root.classList.toggle('chr-collapsed');
      event.target.textContent = root.classList.contains('chr-collapsed') ? '+' : '−';
      event.target.title = root.classList.contains('chr-collapsed') ? '展开' : '收起';
      return;
    }

    if (action === 'refresh') {
      load(state.apiBase);
      return;
    }

    if (action === 'settings') {
      const next = window.prompt('本地服务地址', state.apiBase);
      if (next) {
        chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => load(next));
      }
      return;
    }

    if (action === 'open-stats') {
      window.open(localUrl('/stats'), '_blank', 'noreferrer');
    }
  });

  queryEl.addEventListener('input', filterList);

  chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_API_BASE }, (result) => {
    load(result[STORAGE_KEY] || DEFAULT_API_BASE);
  });
})();
