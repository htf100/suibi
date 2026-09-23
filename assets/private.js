import { createClient } from '@supabase/supabase-js';

const projectUrl = __SUPABASE_URL__;
const publishableKey = __SUPABASE_PUBLISHABLE_KEY__;
const $ = selector => document.querySelector(selector);
const views = ['setup', 'login', 'password', 'inactive', 'timeline', 'reader', 'write', 'admin'];
const invitationMode = ['invite', 'recovery'].includes(new URLSearchParams(location.hash.slice(1)).get('type'));
let passwordLinkComplete = false;
const supabase = projectUrl && publishableKey ? createClient(projectUrl, publishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
}) : null;
let user = null;
let member = null;
let essays = [];
let activeEssay = null;
let currentView = '';
let formDirty = false;
const fields = {
  title: $('#essay-title'), date: $('#essay-date'), time: $('#essay-time'),
  place_name: $('#essay-location'), tags: $('#essay-tags'), summary: $('#essay-summary'), body: $('#essay-body'),
};

function showView(name) {
  if (name === 'admin' && member?.role !== 'owner') name = 'timeline';
  if (!member?.active && ['timeline', 'reader', 'write', 'admin'].includes(name)) name = 'inactive';
  for (const id of views) $(`#${id}-view`).hidden = id !== name;
  $('#app-nav').hidden = !['timeline', 'reader', 'write', 'admin'].includes(name);
  $('#account-menu').hidden = !user;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.closest('#app-nav')) button.setAttribute('aria-current', button.dataset.view === name ? 'page' : 'false');
  }
  currentView = name;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function message(selector, value) { $(selector).textContent = value; }
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function clockTime() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function plainText(markdown) { return markdown.replace(/[#>*_`\[\]()]/g, '').replace(/\s+/g, ' ').trim(); }
function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ''), { USE_PROFILES: { html: true } });
}
function tags(value) { return value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean).slice(0, 12); }
function tagNode(value) { const el = document.createElement('span'); el.className = 'tag'; el.textContent = value; return el; }
function dateLabel(date) {
  const [year, month, day] = String(date).split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}
function errorText(error, fallback = '操作失败，请稍后重试') { return error?.message || fallback; }
function clearPrivateData() {
  essays = [];
  activeEssay = null;
  member = null;
  formDirty = false;
  $('#timeline-list').replaceChildren();
  $('#draft-list').replaceChildren();
  $('#reader-body').replaceChildren();
  for (const selector of ['#reader-date', '#reader-title', '#reader-summary', '#reader-place']) message(selector, '');
  $('#reader-tags').replaceChildren();
  $('#essay-preview').replaceChildren();
  $('#location-suggestions').replaceChildren();
  for (const field of Object.values(fields)) field.value = '';
  $('#legacy-import').hidden = true;
  $('#admin-nav').hidden = true;
  $('#account-label').textContent = '';
}

async function loadSession() {
  if (!supabase) return showView('setup');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    user = null; clearPrivateData();
    return showView('login');
  }
  if (user?.id && user.id !== auth.user.id) clearPrivateData();
  user = auth.user;
  $('#account-label').textContent = user.email || '我的账号';
  const { data, error } = await supabase.from('members')
    .select('user_id, email, display_name, role, active').eq('user_id', user.id).maybeSingle();
  if (error) {
    clearPrivateData();
    message('#login-status', '读取账号权限失败，请稍后刷新页面。');
    return showView('login');
  }
  member = data;
  if (!member?.active) { clearPrivateData(); return showView('inactive'); }
  $('#admin-nav').hidden = member.role !== 'owner';
  if (invitationMode && !passwordLinkComplete) return showView('password');
  await refreshEssays();
  showView('timeline');
}
async function refreshEssays() {
  if (!user || !member?.active) return;
  const { data, error } = await supabase.from('essays').select('*')
    .order('written_date', { ascending: false }).order('written_time', { ascending: false });
  if (error) { message('#save-status', errorText(error, '读取随笔失败')); return; }
  essays = data || [];
  renderTimeline();
  renderDraftList();
  showLegacyImport();
}
function renderTimeline() {
  const list = $('#timeline-list');
  list.replaceChildren();
  const published = essays.filter(essay => essay.status === 'published');
  message('#timeline-count', `${published.length} 个时间节点`);
  if (!published.length) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = '还没有公开给自己的随笔。去写下第一篇吧。';
    list.append(empty);
    return;
  }
  const groups = new Map();
  for (const essay of published) {
    const year = essay.written_date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(essay);
  }
  for (const [year, yearEssays] of groups) {
    const group = document.createElement('div'); group.className = 'timeline-year-group';
    const heading = document.createElement('h3'); heading.className = 'timeline-year';
    heading.textContent = `${year}年`; group.append(heading);
    const entries = document.createElement('div'); entries.className = 'timeline-items';
    for (const essay of yearEssays) {
      const article = document.createElement('article'); article.className = 'timeline-entry';
      const time = document.createElement('div'); time.className = 'timeline-time';
      const day = document.createElement('strong'); day.textContent = essay.written_date.slice(5).replace('-', '.');
      const hour = document.createElement('span'); hour.textContent = essay.written_time || '时刻未记录';
      time.append(day, hour);
      const rail = document.createElement('div'); rail.className = 'timeline-rail';
      rail.append(Object.assign(document.createElement('span'), { className: 'timeline-dot' }));
      const card = document.createElement('div'); card.className = 'timeline-card'; card.tabIndex = 0;
      card.setAttribute('role', 'button'); card.setAttribute('aria-label', `阅读《${essay.title}》`);
      const top = document.createElement('div'); top.className = 'timeline-card-top';
      const place = document.createElement('span'); place.className = 'timeline-place';
      place.textContent = `⌖ ${essay.place_name || '地点未记录'}`;
      top.append(place);
      const title = document.createElement('h4'); title.textContent = essay.title;
      const summary = document.createElement('p'); summary.textContent = essay.summary || plainText(essay.body).slice(0, 90);
      card.append(top, title, summary);
      card.addEventListener('click', () => openReader(essay.id));
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openReader(essay.id); } });
      article.append(time, rail, card); entries.append(article);
    }
    group.append(entries); list.append(group);
  }
}
function openReader(id) {
  const essay = essays.find(item => item.id === id && item.status === 'published');
  if (!essay) return;
  activeEssay = essay;
  message('#reader-date', `${dateLabel(essay.written_date)} ${essay.written_time || ''}`);
  message('#reader-title', essay.title);
  message('#reader-summary', essay.summary || '');
  message('#reader-place', essay.place_name ? `⌖ ${essay.place_name}` : '地点未记录');
  const tagList = $('#reader-tags'); tagList.replaceChildren(...essay.tags.map(tagNode));
  $('#reader-body').innerHTML = renderMarkdown(essay.body);
  showView('reader');
}
function renderDraftList() {
  const list = $('#draft-list'); list.replaceChildren();
  const sorted = [...essays].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  message('#draft-count', `${essays.length} 篇`);
  for (const essay of sorted) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'draft-item';
    const title = document.createElement('strong'); title.textContent = essay.title || '未命名随笔';
    const detail = document.createElement('small'); detail.textContent = `${essay.written_date} · ${essay.status === 'published' ? '时间链路' : '草稿'}`;
    button.append(title, detail);
    if (essay.id === activeEssay?.id) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => loadEditor(essay)); list.append(button);
  }
}
function loadEditor(essay = null) {
  if (formDirty && !confirm('当前修改还没有保存。确定切换随笔吗？')) return;
  activeEssay = essay;
  fields.title.value = essay?.title || '';
  fields.date.value = essay?.written_date || today();
  fields.time.value = essay?.written_time || clockTime();
  fields.place_name.value = essay?.place_name || '';
  fields.tags.value = essay?.tags?.join(', ') || '';
  fields.summary.value = essay?.summary || '';
  fields.body.value = essay?.body || '';
  formDirty = false;
  message('#save-status', essay ? (essay.status === 'published' ? '已在时间链路中，仅你可见' : '草稿已保存在私人空间') : '新随笔尚未保存');
  $('#location-suggestions').hidden = true;
  renderPreview(); renderDraftList(); showView('write');
}
function renderPreview() {
  const preview = $('#essay-preview');
  if (!fields.body.value.trim()) { preview.textContent = '写下第一段，预览会出现在这里。'; return; }
  preview.innerHTML = renderMarkdown(fields.body.value);
}
function currentPayload(status) {
  const date = fields.date.value;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择写作日期');
  const title = fields.title.value.trim();
  const body = fields.body.value.trim();
  if (status === 'published' && (!title || !body)) throw new Error('放入时间链路前，请填写标题和正文');
  return {
    title, body, written_date: date, written_time: fields.time.value,
    place_name: fields.place_name.value.trim(), summary: fields.summary.value.trim(),
    tags: tags(fields.tags.value), status,
  };
}
async function saveEssay(status) {
  if (!user || !member?.active) return;
  let payload;
  try { payload = currentPayload(status); }
  catch (error) { message('#save-status', error.message); return; }
  const button = status === 'published' ? $('#publish-essay') : $('#save-draft');
  button.disabled = true;
  message('#save-status', '正在保存到私人空间…');
  let result;
  if (activeEssay?.id) {
    result = await supabase.from('essays').update(payload).eq('id', activeEssay.id).select().single();
  } else {
    result = await supabase.from('essays').insert({ ...payload, owner_id: user.id }).select().single();
  }
  button.disabled = false;
  if (result.error) return message('#save-status', errorText(result.error, '保存失败'));
  activeEssay = result.data;
  formDirty = false;
  await refreshEssays();
  message('#save-status', status === 'published' ? '已放入你的私人时间链路' : '草稿已保存在私人空间');
  if (status === 'published') showView('timeline');
}
async function deleteEssay() {
  if (!activeEssay) return;
  if (!confirm(`确定删除「${activeEssay.title || '未命名随笔'}」吗？删除后无法从网站恢复。`)) return;
  const { error } = await supabase.from('essays').delete().eq('id', activeEssay.id);
  if (error) return message('#save-status', errorText(error, '删除失败'));
  activeEssay = null; formDirty = false;
  await refreshEssays(); loadEditor();
  message('#save-status', '随笔已删除');
}
function markdownBackup() {
  let essay;
  try { essay = currentPayload(activeEssay?.status || 'draft'); }
  catch (error) { message('#save-status', error.message); return; }
  const quoted = value => JSON.stringify(value);
  const content = `---\ntitle: ${quoted(essay.title)}\ndate: ${essay.written_date}\ntime: ${quoted(essay.written_time)}\nlocation: ${quoted(essay.place_name)}\nsummary: ${quoted(essay.summary)}\ntags: ${quoted(essay.tags)}\n---\n\n${essay.body}\n`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  link.download = `${essay.written_date}-${activeEssay?.id || 'essay'}.md`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function parseMarkdownFile(text) {
  text = text.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { body: text, metadata: {} };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { body: text, metadata: {} };
  const metadata = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = line.match(/^(title|date|time|location|summary|tags):\s*(.*)$/);
    if (!match) continue;
    try { metadata[match[1]] = JSON.parse(match[2]); }
    catch { metadata[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
  }
  return { body: text.slice(end + 5), metadata };
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return message('#save-status', '文件超过 5 MB，请先缩小文件');
  const ext = file.name.split('.').pop().toLowerCase();
  let body, metadata = {};
  try {
    if (ext === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const doc = new DOMParser().parseFromString(DOMPurify.sanitize(result.value), 'text/html');
      doc.querySelectorAll('img').forEach(img => img.remove());
      body = new TurndownService({ headingStyle: 'atx' }).turndown(doc.body);
    } else if (['md', 'markdown', 'txt'].includes(ext)) {
      ({ body, metadata } = ext === 'txt' ? { body: await file.text(), metadata: {} } : parseMarkdownFile(await file.text()));
    } else throw new Error('请选择 .md、.txt 或 .docx 文件');
    if (!body.trim()) throw new Error('文件里没有文字');
    if (formDirty && !confirm('当前修改未保存。确定导入另一篇吗？')) return;
    formDirty = false;
    loadEditor();
    fields.title.value = String(metadata.title || file.name.replace(/\.(md|markdown|txt|docx)$/i, '')).slice(0, 100);
    fields.date.value = /^\d{4}-\d{2}-\d{2}$/.test(String(metadata.date || '')) ? metadata.date : today();
    fields.time.value = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(metadata.time || '')) ? metadata.time : clockTime();
    fields.place_name.value = String(metadata.location || '').slice(0, 100);
    fields.summary.value = String(metadata.summary || '').slice(0, 180);
    fields.tags.value = Array.isArray(metadata.tags) ? metadata.tags.join(', ') : String(metadata.tags || '');
    fields.body.value = body; formDirty = true; renderPreview();
    message('#save-status', '已导入，请保存到私人空间');
  } catch (error) { message('#save-status', errorText(error, '导入失败')); }
}
function showLegacyImport() {
  try {
    const drafts = JSON.parse(localStorage.getItem('tf-essay-drafts-v1') || '[]');
    $('#legacy-import').hidden = !Array.isArray(drafts) || !drafts.some(d => d && (d.title || d.body));
  } catch { $('#legacy-import').hidden = true; }
}
async function importLegacy() {
  if (!confirm('把此浏览器中的旧草稿导入当前登录账号？请先确认这是你自己的账号。导入成功后会清除旧版浏览器副本。')) return;
  let drafts;
  try { drafts = JSON.parse(localStorage.getItem('tf-essay-drafts-v1') || '[]'); }
  catch { return message('#save-status', '旧草稿格式无效'); }
  let imported = 0;
  for (const draft of drafts.filter(d => d && (d.title || d.body))) {
    const payload = {
      owner_id: user.id, title: String(draft.title || '').slice(0, 100), body: String(draft.body || ''),
      written_date: /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') ? draft.date : today(),
      written_time: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time || '') ? draft.time : '',
      place_name: String(draft.location || '').slice(0, 100), summary: String(draft.summary || '').slice(0, 180),
      tags: tags(String(draft.tags || '')), status: 'draft',
    };
    const { error } = await supabase.from('essays').insert(payload);
    if (error) { message('#save-status', `已导入 ${imported} 篇；后续导入失败，旧草稿仍在浏览器中。`); return; }
    imported++;
  }
  localStorage.removeItem('tf-essay-drafts-v1');
  localStorage.removeItem('tf-essay-active-v1');
  await refreshEssays();
  message('#save-status', `已导入 ${imported} 篇旧草稿，旧版浏览器副本已清除`);
}
async function locateNow() {
  if (!navigator.geolocation || !window.isSecureContext) return message('#location-status', '当前浏览器无法定位，请手动填写地点。');
  const button = $('#locate-now'); button.disabled = true;
  const list = $('#location-suggestions'); list.replaceChildren(); list.hidden = true;
  message('#location-status', '等待浏览器定位授权…');
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }));
    const { latitude, longitude, accuracy } = position.coords;
    if (accuracy > 500) throw new Error(`定位误差约 ${Math.round(accuracy)} 米，请开启精确定位后重试，或手动填写。`);
    message('#location-status', '正在查找附近地点…');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
    let data;
    try {
      const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), radius: '0.3', limit: '15' });
      const response = await fetch(`https://photon.komoot.io/reverse?${params}`, { credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error('地点服务暂时不可用');
      data = await response.json();
    } finally { clearTimeout(timeout); }
    const seen = new Set();
    const candidates = (data.features || []).filter(feature => feature.properties?.name && !['place', 'boundary'].includes(feature.properties.osm_key))
      .filter(feature => { const name = feature.properties.name.trim(); if (!name || name.length > 100 || seen.has(name)) return false; seen.add(name); return true; }).slice(0, 8);
    if (!candidates.length) throw new Error('附近没有具体地点名称，请手动填写楼栋或景点位置');
    for (const feature of candidates) {
      const option = document.createElement('button'); option.type = 'button'; option.className = 'location-option';
      option.textContent = feature.properties.name;
      option.addEventListener('click', () => { fields.place_name.value = feature.properties.name; formDirty = true; list.hidden = true; message('#location-status', '地点已填写。请核对名称，保存后只有你能看到。'); });
      list.append(option);
    }
    list.hidden = false;
    message('#location-status', `定位误差约 ${Math.round(accuracy)} 米，请选择并核对附近地点。`);
  } catch (error) {
    message('#location-status', error.code === 1 ? '未获得定位权限，可以手动填写地点。' : (error.message || '定位失败，请手动填写。'));
  } finally { button.disabled = false; }
}
async function adminAction(input) {
  const { data, error } = await supabase.functions.invoke('manage-members', { body: input });
  if (error) throw new Error(data?.error || error.message || '账号操作失败');
  if (data?.error) throw new Error(data.error);
  return data;
}
async function renderMembers() {
  if (member?.role !== 'owner') return;
  const list = $('#member-list'); list.textContent = '正在读取成员…';
  try {
    const { members } = await adminAction({ action: 'list' });
    list.replaceChildren();
    for (const item of members) {
      const row = document.createElement('div'); row.className = 'member-row';
      const identity = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = item.display_name || item.email;
      const email = document.createElement('small'); email.textContent = item.email;
      identity.append(name, email);
      const status = document.createElement('span'); status.textContent = item.role === 'owner' ? '管理员 · 自己' : (item.active ? '已启用' : '已停用');
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.disabled = item.role === 'owner';
      toggle.textContent = item.active ? '停用' : '启用';
      toggle.addEventListener('click', async () => {
        if (!confirm(`${item.active ? '停用' : '启用'} ${item.email}？`)) return;
        toggle.disabled = true;
        try { const result = await adminAction({ action: 'set_active', user_id: item.user_id, active: !item.active }); message('#admin-status', result.message); await renderMembers(); }
        catch (error) { toggle.disabled = false; message('#admin-status', error.message); }
      });
      row.append(identity, status, toggle); list.append(row);
    }
  } catch (error) { list.textContent = error.message; }
}

if (!supabase) showView('setup');
else {
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    message('#login-status', '正在登录…');
    const { error } = await supabase.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value });
    $('#login-password').value = '';
    if (error) return message('#login-status', '登录失败，请核对邮箱和密码。');
    await loadSession();
  });
  $('#reset-password').addEventListener('click', async () => {
    const email = $('#login-email').value.trim();
    if (!email) return message('#login-status', '请先填写邮箱');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    message('#login-status', error ? errorText(error) : '如果此邮箱有账号，重置邮件会发送到邮箱。');
  });
  $('#password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('#new-password').value;
    if (password.length < 12) return message('#password-status', '密码至少 12 位');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return message('#password-status', errorText(error));
    $('#new-password').value = '';
    passwordLinkComplete = true;
    history.replaceState(null, '', location.pathname);
    await loadSession();
  });
  $('#sign-out').addEventListener('click', async () => { await supabase.auth.signOut(); user = null; clearPrivateData(); showView('login'); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    const view = button.dataset.view;
    if (view === 'write') return loadEditor();
    if (view === 'admin') { await renderMembers(); return showView('admin'); }
    showView(view);
  }));
  $('#edit-current').addEventListener('click', () => loadEditor(activeEssay));
  $('#new-essay').addEventListener('click', () => loadEditor());
  $('#save-draft').addEventListener('click', () => saveEssay('draft'));
  $('#publish-essay').addEventListener('click', () => saveEssay('published'));
  $('#delete-essay').addEventListener('click', deleteEssay);
  $('#download-essay').addEventListener('click', markdownBackup);
  $('#import-file').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
  $('#import-legacy').addEventListener('click', importLegacy);
  $('#locate-now').addEventListener('click', locateNow);
  for (const field of Object.values(fields)) field.addEventListener('input', () => { formDirty = true; message('#save-status', '有尚未保存的修改'); if (field === fields.body) renderPreview(); });
  document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
    const input = fields.body; const start = input.selectionStart; const end = input.selectionEnd;
    const selected = input.value.slice(start, end);
    const value = { heading: `\n## ${selected || '小标题'}\n`, bold: `**${selected || '加粗文字'}**`, quote: `\n> ${selected || '引用文字'}\n`, list: `\n- ${selected || '列表项目'}\n` }[button.dataset.insert];
    input.setRangeText(value, start, end, 'select'); input.focus(); formDirty = true; renderPreview(); message('#save-status', '有尚未保存的修改');
  }));
  $('#invite-form').addEventListener('submit', async event => {
    event.preventDefault(); message('#admin-status', '正在发送邀请…');
    try {
      const result = await adminAction({ action: 'invite', email: $('#invite-email').value, display_name: $('#invite-name').value });
      message('#admin-status', result.message); $('#invite-form').reset(); await renderMembers();
    } catch (error) { message('#admin-status', error.message); }
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { user = null; clearPrivateData(); showView('login'); }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => { if (!user) loadSession(); }, 0);
  });
  loadSession();
}
