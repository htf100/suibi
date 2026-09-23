import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const localEnv = path.join(root, '.env.local');
if (fs.existsSync(localEnv)) process.loadEnvFile(localEnv);
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
const basePath = `/${(process.env.BASE_PATH ?? '/').split('/').filter(Boolean).join('/')}/`.replace('//', '/');
const projectUrl = process.env.SUPABASE_URL ?? '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
if (projectUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(projectUrl)) throw new Error('SUPABASE_URL must be a Supabase HTTPS project URL');
if (Boolean(projectUrl) !== Boolean(publishableKey)) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
if (process.env.PRIVATE_RELEASE === '1' && (!projectUrl || !publishableKey)) throw new Error('Private release requires Supabase configuration');
if (publishableKey) {
  let safeKey = publishableKey.startsWith('sb_publishable_');
  if (!safeKey && publishableKey.split('.').length === 3) {
    try { safeKey = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()).role === 'anon'; }
    catch { /* Invalid or non-anon key. */ }
  }
  if (!safeKey) throw new Error('Only a Supabase publishable/anon key may be embedded in GitHub Pages');
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const url = part => basePath + part;

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets', 'vendor'), { recursive: true });
for (const asset of ['style.css', 'private.css', 'favicon.svg']) {
  fs.copyFileSync(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
}
for (const [source, dest] of [
  ['marked/lib/marked.umd.js', 'marked.umd.js'],
  ['dompurify/dist/purify.min.js', 'purify.min.js'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['turndown/dist/turndown.js', 'turndown.js'],
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, 'assets', 'vendor', dest));
fs.mkdirSync(path.join(output, 'assets', 'vendor', 'licenses'), { recursive: true });
for (const [source, dest] of [
  ['marked/LICENSE.md', 'marked.txt'],
  ['dompurify/LICENSE', 'purify.txt'],
  ['mammoth/LICENSE', 'mammoth.txt'],
  ['turndown/LICENSE', 'turndown.txt'],
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, 'assets', 'vendor', 'licenses', dest));
await build({
  entryPoints: [path.join(root, 'assets', 'private.js')],
  outfile: path.join(output, 'assets', 'private.bundle.js'),
  bundle: true,
  minify: true,
  target: ['es2022'],
  format: 'iife',
  define: {
    __SUPABASE_URL__: JSON.stringify(projectUrl),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publishableKey),
  },
});
fs.writeFileSync(path.join(output, '.nojekyll'), '');
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${projectUrl || ''} https://photon.komoot.io; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="${escape(csp)}">
<meta name="theme-color" content="#f6f3eb"><link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${url('assets/style.css')}?v=private-1"><link rel="stylesheet" href="${url('assets/private.css')}?v=private-1">
<script src="${url('assets/vendor/marked.umd.js')}" defer></script><script src="${url('assets/vendor/purify.min.js')}" defer></script><script src="${url('assets/vendor/mammoth.browser.min.js')}" defer></script><script src="${url('assets/vendor/turndown.js')}" defer></script>
<script src="${url('assets/private.bundle.js')}?v=private-1" defer></script>
<title>${escape(site.name)} · 私人随笔</title></head><body>
<div class="site-wrap"><header class="site-header"><a class="brand" href="${basePath}"><span class="brand-mark" aria-hidden="true">✳</span><span>${escape(site.name)}<small>PRIVATE ESSAYS</small></span></a><nav id="app-nav" aria-label="主导航" hidden><button type="button" data-view="timeline">时间链路</button><button type="button" data-view="write">写随笔</button><button type="button" data-view="admin" id="admin-nav" hidden>账号管理</button></nav><div class="account-menu" id="account-menu" hidden><span id="account-label"></span><button id="sign-out" type="button">退出</button></div></header>
<main id="main">
<section id="setup-view" class="auth-shell" hidden><p class="eyebrow">PRIVATE SPACE</p><h1>私人空间正在准备。</h1><p>账号服务接通后，就可以在这里登录。</p></section>
<section id="login-view" class="auth-shell" hidden><p class="eyebrow">PRIVATE SPACE / 仅受邀可用</p><h1>进入自己的随笔。</h1><p>每个人只会看到自己写下的时间链路。</p><form id="login-form" class="auth-form"><label>邮箱<input id="login-email" type="email" required autocomplete="username"></label><label>密码<input id="login-password" type="password" required autocomplete="current-password"></label><button type="submit" class="publish-button">登录</button></form><button id="reset-password" class="text-button" type="button">忘记密码？发送重置邮件</button><p id="login-status" class="form-status" role="status" aria-live="polite"></p></section>
<section id="password-view" class="auth-shell" hidden><p class="eyebrow">ACCOUNT SETUP</p><h1>设置你的密码。</h1><form id="password-form" class="auth-form"><label>新密码<input id="new-password" type="password" minlength="12" required autocomplete="new-password"></label><button class="publish-button" type="submit">保存密码，进入随笔</button></form><p id="password-status" class="form-status" role="status"></p></section>
<section id="inactive-view" class="auth-shell" hidden><p class="eyebrow">ACCESS PAUSED</p><h1>这个账号尚未启用。</h1><p>请联系邀请你的人。</p></section>
<section id="timeline-view" hidden><div class="timeline-hero private-hero"><div class="timeline-hero-copy"><p class="eyebrow">MY TIME NOTES / 只属于我的时间链路</p><h1>时间有迹，<br><em>文字有处可去。</em></h1><p>只有你能在这里读到自己的随笔。</p><button type="button" data-view="write" class="primary-link">写下此刻 ↗</button></div><div class="timeline-hero-art" aria-hidden="true"><div class="timeline-orbit"><span class="orbit-center">此刻</span></div></div></div><div class="timeline-section"><div class="section-head"><div><p class="eyebrow">PRIVATE TIMELINE</p><h2>沿着时间，慢慢读</h2></div><span id="timeline-count" class="timeline-count"></span></div><div id="timeline-list" class="timeline-list"></div></div></section>
<section id="reader-view" class="essay" hidden><button type="button" data-view="timeline" class="back-link text-button">← 返回时间链路</button><header class="essay-header"><div id="reader-date" class="post-meta"></div><h1 id="reader-title"></h1><p id="reader-summary" class="essay-summary"></p><p id="reader-place" class="essay-location"></p><div id="reader-tags" class="essay-tags"></div></header><div id="reader-body" class="prose essay-body"></div><button id="edit-current" type="button" class="soft-button">编辑这篇随笔</button></section>
<section id="write-view" hidden><div class="page-heading write-heading"><p class="eyebrow">WRITE YOUR WORDS / 私密写作</p><h1>把今天写下来<span class="title-period">。</span></h1><p>保存草稿，或放入只属于你的时间链路。</p></div><div class="writing-app"><div class="writing-topbar"><div><strong>我的随笔</strong><span id="draft-count"></span></div><div class="writing-top-actions"><button id="new-essay" type="button">＋ 新建</button><label class="import-button" for="import-file">↑ 导入文件</label><input id="import-file" type="file" accept=".md,.markdown,.txt,.docx" hidden></div></div><div class="writing-layout"><aside class="draft-panel"><div id="draft-list" class="draft-list"></div><div id="legacy-import" class="legacy-import" hidden><p>发现旧版浏览器草稿。确认当前登录的是你自己的账号后，可以导入。</p><button type="button" id="import-legacy" class="soft-button">导入旧草稿</button></div></aside><div class="editor-panel"><div class="editor-meta"><label>标题<input id="essay-title" maxlength="100" placeholder="给这篇随笔起个名字"></label><div class="editor-meta-row date-time-row"><label>写作日期<input id="essay-date" type="date"></label><label>写作时间<input id="essay-time" type="time"></label></div><div class="editor-meta-row place-row"><label>写作地点<input id="essay-location" maxlength="100" placeholder="例如：图书馆三楼、教学楼 A 座"></label><label>标签 <small>用逗号分开</small><input id="essay-tags" placeholder="日常, 阅读"></label></div><div class="location-picker"><div class="location-picker-top"><button id="locate-now" type="button" class="soft-button">◎ 获取当前位置</button><span id="location-status" role="status" aria-live="polite">地点由你决定，只会显示在自己的随笔中。</span></div><div id="location-suggestions" class="location-suggestions" hidden></div><p class="location-credit">点击定位后，坐标会发送给 <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a> 查找 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> 地点；随笔只保存所选名称。</p></div><label>一句话简介<input id="essay-summary" maxlength="180"></label></div><div class="editor-toolbar"><span>正文</span><div><button type="button" data-insert="heading">标题</button><button type="button" data-insert="bold">加粗</button><button type="button" data-insert="quote">引用</button><button type="button" data-insert="list">列表</button></div></div><div class="writing-columns"><label class="editor-body-label"><span class="sr-only">随笔正文</span><textarea id="essay-body" placeholder="从今天的一句话开始写……"></textarea></label><div class="preview-panel"><div class="preview-label">实时预览</div><div id="essay-preview" class="prose"></div></div></div><div class="editor-actions"><span id="save-status" class="save-status" role="status"></span><div><button id="delete-essay" type="button" class="muted-button">删除</button><button id="download-essay" type="button" class="muted-button">下载 Markdown</button><button id="save-draft" type="button" class="soft-button">保存草稿</button><button id="publish-essay" type="button" class="publish-button">放入我的时间链路 ↗</button></div></div></div></div></div></section>
<section id="admin-view" hidden><div class="page-heading"><p class="eyebrow">ACCOUNT MANAGEMENT</p><h1>账号管理<span class="title-period">。</span></h1><p>你可以邀请或停用成员；随笔内容只向作者本人显示。</p></div><form id="invite-form" class="invite-form"><label>受邀人的邮箱<input id="invite-email" type="email" required autocomplete="off"></label><label>显示名称<input id="invite-name" maxlength="60" placeholder="可留空"></label><button type="submit" class="publish-button">发送邀请</button></form><p id="admin-status" class="form-status" role="status"></p><div id="member-list" class="member-list"></div></section>
</main><footer class="site-footer"><p>${escape(site.footer)} <span>© ${new Date().getFullYear()} ${escape(site.author)}</span></p><span>私人随笔</span></footer></div></body></html>`;
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, '404.html'), html);
console.log(`Built private app at ${output}${projectUrl ? ' with Supabase configuration' : ' without backend configuration'}`);
