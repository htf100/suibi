(() => {
  const app = document.querySelector('#writing-app');
  if (!app) return;
  const key = 'tf-essay-drafts-v1';
  const activeKey = 'tf-essay-active-v1';
  const owner = app.dataset.owner;
  const repo = app.dataset.repo;
  const siteUrl = app.dataset.siteUrl;
  marked.setOptions({ gfm: true, breaks: true });
  const $ = selector => document.querySelector(selector);
  const fields = {
    title: $('#essay-title'), date: $('#essay-date'), time: $('#essay-time'),
    location: $('#essay-location'), tags: $('#essay-tags'), summary: $('#essay-summary'),
    slug: $('#essay-slug'), body: $('#essay-body')
  };
  const saveStatus = $('#save-status');
  const publishStatus = $('#publish-status');
  let drafts = readDrafts();
  let activeId = localStorage.getItem(activeKey);
  let saveTimer;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function makeDraft() {
    const id = crypto.randomUUID();
    return { id, title: '', date: today(), time: nowTime(), location: '', tags: '', summary: '', slug: `essay-${id.slice(0, 8)}`,
      body: '', updatedAt: Date.now(), publishedPath: null, publishedSha: null };
  }
  function readDrafts() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === 'string') : [];
    } catch { return []; }
  }
  function current() { return drafts.find(d => d.id === activeId); }
  function persist() {
    const draft = current();
    if (!draft) return false;
    for (const [name, input] of Object.entries(fields)) draft[name] = input.value;
    draft.updatedAt = Date.now();
    try {
      localStorage.setItem(key, JSON.stringify(drafts));
      localStorage.setItem(activeKey, activeId);
      saveStatus.textContent = '草稿已保存到此浏览器';
      renderList();
      return true;
    } catch {
      saveStatus.textContent = '保存失败：浏览器存储空间不足，请先下载 Markdown 备份';
      return false;
    }
  }
  function createDraft() {
    clearTimeout(saveTimer);
    persist();
    const draft = makeDraft();
    drafts.unshift(draft);
    activeId = draft.id;
    loadCurrent();
    persist();
    fields.title.focus();
  }
  function loadCurrent() {
    const draft = current();
    if (!draft) return;
    for (const [name, input] of Object.entries(fields)) input.value = draft[name] ?? '';
    fields.slug.readOnly = Boolean(draft.publishedPath);
    $('#publish-panel').hidden = true;
    $('#github-token').value = '';
    publishStatus.textContent = '';
    renderPreview();
    renderList();
    saveStatus.textContent = draft.publishedPath ? '已发布过，可以修改后再次发布' : '草稿已保存到此浏览器';
  }
  function renderList() {
    const list = $('#draft-list');
    list.replaceChildren();
    [...drafts].sort((a, b) => b.updatedAt - a.updatedAt).forEach(draft => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'draft-item';
      if (draft.id === activeId) button.setAttribute('aria-current', 'true');
      const title = document.createElement('strong');
      title.textContent = draft.title.trim() || '未命名随笔';
      const detail = document.createElement('small');
      detail.textContent = `${draft.date || '未设日期'}${draft.time ? ` ${draft.time}` : ''} · ${draft.publishedPath ? '已发布' : '草稿'}`;
      button.append(title, detail);
      button.addEventListener('click', () => {
        if (draft.id === activeId) return;
        clearTimeout(saveTimer);
        persist();
        activeId = draft.id;
        loadCurrent();
        localStorage.setItem(activeKey, activeId);
      });
      list.append(button);
    });
    $('#draft-count').textContent = `${drafts.length} 篇`;
  }
  function renderPreview() {
    const output = $('#essay-preview');
    if (!fields.body.value.trim()) {
      output.textContent = '写下第一段，预览会出现在这里。';
      output.classList.add('preview-empty');
      return;
    }
    output.classList.remove('preview-empty');
    output.innerHTML = DOMPurify.sanitize(marked.parse(fields.body.value.replaceAll('{{baseurl}}', app.dataset.basePath)), { USE_PROFILES: { html: true } });
  }
  function scheduleSave() {
    saveStatus.textContent = '正在写入草稿…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  }
  function fileTitle(name) {
    return name.replace(/\.(md|markdown|txt|docx)$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ').trim();
  }
  function parseMarkdown(text) {
    text = text.replace(/\r\n/g, '\n');
    if (!text.startsWith('---\n')) return { body: text, metadata: {} };
    const end = text.indexOf('\n---\n', 4);
    if (end < 0) return { body: text, metadata: {} };
    const metadata = {};
    for (const line of text.slice(4, end).split('\n')) {
      const match = line.match(/^(title|date|time|location|summary|tags|slug):\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
      } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (match[1] === 'tags') value = value.replace(/^\[|\]$/g, '').split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).join(', ');
      metadata[match[1]] = value;
    }
    return { body: text.slice(end + 5), metadata };
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      saveStatus.textContent = '文件超过 5 MB，请先缩小文件再导入';
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    let body, metadata = {}, warning = '';
    try {
      if (ext === 'docx') {
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        const documentNode = new DOMParser().parseFromString(DOMPurify.sanitize(result.value), 'text/html');
        const images = documentNode.querySelectorAll('img');
        if (images.length) warning = `已导入文字和基本格式；${images.length} 张 Word 图片暂未导入。`;
        images.forEach(image => image.remove());
        body = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }).turndown(documentNode.body);
      } else if (['md', 'markdown', 'txt'].includes(ext)) {
        const parsed = ext === 'txt' ? { body: await file.text(), metadata: {} } : parseMarkdown(await file.text());
        body = parsed.body;
        metadata = parsed.metadata;
      } else throw new Error('请选择 .md、.txt 或 .docx 文件');
      if (!body.trim()) throw new Error('文件中没有可导入的文字');
      clearTimeout(saveTimer);
      persist();
      const draft = makeDraft();
      draft.title = metadata.title || fileTitle(file.name);
      draft.date = /^\d{4}-\d{2}-\d{2}$/.test(metadata.date || '') ? metadata.date : today();
      draft.time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(metadata.time || '') ? metadata.time : (['md', 'markdown'].includes(ext) ? '' : nowTime());
      draft.location = metadata.location || '';
      draft.summary = metadata.summary || '';
      draft.tags = metadata.tags || '';
      draft.slug = /^[a-z0-9-]+$/.test(metadata.slug || '') ? metadata.slug : draft.slug;
      draft.body = body;
      drafts.unshift(draft);
      activeId = draft.id;
      loadCurrent();
      persist();
      saveStatus.textContent = `已导入 ${file.name}。${warning}`;
    } catch (error) {
      saveStatus.textContent = `导入失败：${error.message}`;
    }
  }
  function frontMatter(draft) {
    const summary = draft.summary.trim() || draft.body.replace(/[#>*_`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const tags = draft.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
    return `---\ntitle: ${JSON.stringify(draft.title.trim())}\ndate: ${draft.date}\n${draft.time ? `time: ${JSON.stringify(draft.time)}\n` : ''}${draft.location.trim() ? `location: ${JSON.stringify(draft.location.trim())}\n` : ''}summary: ${JSON.stringify(summary)}\ntags: ${JSON.stringify(tags)}\nslug: ${draft.slug.trim()}\n---\n\n${draft.body.trim()}\n`;
  }
  function downloadDraft() {
    if (!persist()) return;
    const draft = current();
    const blob = new Blob([frontMatter(draft)], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${draft.date}-${draft.slug || 'essay'}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    saveStatus.textContent = 'Markdown 备份已下载';
  }
  function insertMarkdown(kind) {
    const input = fields.body;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.slice(start, end);
    const templates = {
      heading: `\n## ${selected || '小标题'}\n`,
      bold: `**${selected || '加粗文字'}**`,
      quote: `\n> ${selected || '引用文字'}\n`,
      list: `\n- ${selected || '列表项目'}\n`,
      link: `[${selected || '链接文字'}](https://)`
    };
    input.setRangeText(templates[kind], start, end, 'select');
    input.focus();
    renderPreview();
    scheduleSave();
  }
  function setPublishStatus(message, link) {
    publishStatus.replaceChildren(document.createTextNode(message));
    if (link) {
      const a = document.createElement('a');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '打开文章 ↗';
      publishStatus.append(' ', a);
    }
  }
  async function githubRequest(path, token, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    let result = {};
    try { result = await response.json(); } catch { /* GitHub may return an empty body. */ }
    return { response, result };
  }
  function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }
  async function publish() {
    if (!persist()) return;
    const draft = current();
    if (!draft.title.trim() || !draft.body.trim()) return setPublishStatus('请先填写标题和正文。');
    const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && !Number.isNaN(Date.parse(`${draft.date}T12:00:00Z`)) && new Date(`${draft.date}T12:00:00Z`).toISOString().slice(0, 10) === draft.date;
    if (!dateValid) return setPublishStatus('请填写有效日期。');
    if (draft.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return setPublishStatus('请填写有效的写作时间。');
    if (draft.location.length > 100) return setPublishStatus('写作地点不能超过 100 个字。');
    if (!/^[a-z0-9-]+$/.test(draft.slug)) return setPublishStatus('文章地址只能使用小写英文、数字和短横线。');
    const tokenInput = $('#github-token');
    const token = tokenInput.value.trim();
    if (!token) return setPublishStatus('请先粘贴 GitHub 细粒度令牌。');
    const button = $('#confirm-publish');
    button.disabled = true;
    setPublishStatus('正在验证授权并提交…');
    try {
      const { response: userResponse, result: user } = await githubRequest('/user', token);
      if (!userResponse.ok) throw new Error('令牌无效或已过期，请检查后重试。');
      if (user.login.toLowerCase() !== owner.toLowerCase()) throw new Error(`当前令牌属于 ${user.login}，请使用 ${owner} 账号的令牌。`);
      const path = draft.publishedPath || `posts/${draft.date}-${draft.slug}.md`;
      const apiPath = `/repos/${owner}/${repo}/contents/${path}`;
      const { response: existingResponse, result: existing } = await githubRequest(`${apiPath}?ref=main`, token);
      if (existingResponse.status !== 200 && existingResponse.status !== 404) throw new Error(`读取仓库失败（${existingResponse.status}）：${existing.message || '请稍后重试'}`);
      if (!draft.publishedPath && existingResponse.status === 200) throw new Error('仓库里已有同名文章，请修改文章地址后再发布。');
      if (draft.publishedPath && existingResponse.status !== 200) throw new Error('原文章在仓库中找不到了，请先检查仓库文件。');
      if (draft.publishedSha && existing.sha !== draft.publishedSha) throw new Error('这篇文章已在 GitHub 被修改。请先备份当前草稿，再检查线上版本，避免覆盖。');
      const payload = { message: `${existingResponse.status === 200 ? 'Update' : 'Publish'} essay: ${draft.title.trim()}`,
        content: base64Utf8(frontMatter(draft)), branch: 'main' };
      if (existingResponse.status === 200) payload.sha = existing.sha;
      const { response, result } = await githubRequest(apiPath, token, { method: 'PUT', body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`发布失败（${response.status}）：${result.message || '请检查令牌权限'}`);
      draft.publishedPath = path;
      draft.publishedSha = result.content?.sha || null;
      fields.slug.readOnly = true;
      persist();
      tokenInput.value = '';
      setPublishStatus('已提交到 GitHub，页面通常会在稍后更新。', `${siteUrl}essays/${draft.slug}/`);
      saveStatus.textContent = '已发布；草稿仍保留在此浏览器';
    } catch (error) {
      setPublishStatus(error.message || '发布失败，请稍后重试。');
    } finally { button.disabled = false; }
  }

  if (!current()) {
    const draft = makeDraft();
    drafts.unshift(draft);
    activeId = draft.id;
  }
  loadCurrent();
  persist();
  for (const input of Object.values(fields)) {
    input.addEventListener('input', () => { renderPreview(); scheduleSave(); });
  }
  $('#new-draft').addEventListener('click', createDraft);
  $('#save-draft').addEventListener('click', persist);
  $('#download-draft').addEventListener('click', downloadDraft);
  $('#import-file').addEventListener('change', event => {
    importFile(event.target.files[0]);
    event.target.value = '';
  });
  $('#delete-draft').addEventListener('click', () => {
    const draft = current();
    if (!confirm(`删除本机草稿「${draft.title || '未命名随笔'}」？已发布的文章仍保留在网站上。`)) return;
    drafts = drafts.filter(item => item.id !== activeId);
    if (!drafts.length) drafts.push(makeDraft());
    activeId = drafts[0].id;
    loadCurrent();
    persist();
  });
  document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => insertMarkdown(button.dataset.insert)));
  $('#open-publish').addEventListener('click', () => {
    persist();
    $('#publish-panel').hidden = false;
    $('#publish-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#close-publish').addEventListener('click', () => {
    $('#github-token').value = '';
    $('#publish-panel').hidden = true;
  });
  $('#confirm-publish').addEventListener('click', publish);
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); persist(); });
})();
