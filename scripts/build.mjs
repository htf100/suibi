import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const postsDir = path.join(root, 'posts');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
const basePath = normalizeBasePath(process.env.BASE_PATH ?? '/');
const siteUrl = (process.env.SITE_URL ?? `https://example.com${basePath}`).replace(/\/$/, '') + '/';
const year = new Date().getFullYear();

function normalizeBasePath(value) {
  return `/${value.split('/').filter(Boolean).join('/')}${value === '/' ? '' : '/'}`;
}
function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function xml(value) { return html(value); }
function url(part = '') { return basePath + part.replace(/^\//, ''); }
function absolute(part = '') { return siteUrl + part.replace(/^\//, ''); }
function markdown(value) {
  return sanitizeHtml(marked.parse(value.replaceAll('{{baseurl}}', basePath)), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'title'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto']
  });
}
function dateLabel(date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
function readMinutes(content) {
  const plain = content.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.ceil(plain.length / 350));
}
function writePage(relative, content) {
  const target = path.join(output, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function tagsMarkup(tags) {
  return tags.map(tag => `<span class="tag">${html(tag)}</span>`).join('');
}
function metaLine(post) {
  return `<span>${dateLabel(post.date)}${post.time ? ` ${html(post.time)}` : ''}</span><span class="meta-dot" aria-hidden="true"></span><span>${post.minutes} 分钟阅读</span>`;
}
function placeMarkup(post, className = 'post-place') {
  const label = post.location || '地点未记录';
  return `<span class="${className}"><span aria-hidden="true">⌖</span> ${html(label)}</span>`;
}
function shell({ title, description, canonical, page, content, article = false }) {
  const fullTitle = title ? `${title} · ${config.name}` : `${config.name} · 随笔`;
  const ogType = article ? 'article' : 'website';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f6f3eb">
  <meta name="description" content="${html(description)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${html(fullTitle)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${html(canonical)}">
  <link rel="canonical" href="${html(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="${html(config.name)} RSS" href="${url('feed.xml')}">
  <link rel="icon" href="${url('assets/favicon.svg')}" type="image/svg+xml">
  <link rel="stylesheet" href="${url('assets/style.css')}?v=location-1">
  ${page === 'write' ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <script src="${url('assets/site.js')}?v=location-1" defer></script>
  ${page === 'write' ? `<script src="${url('assets/vendor/marked.umd.js')}" defer></script><script src="${url('assets/vendor/purify.min.js')}" defer></script><script src="${url('assets/vendor/mammoth.browser.min.js')}" defer></script><script src="${url('assets/vendor/turndown.js')}" defer></script><script src="${url('assets/write.js')}?v=location-1" defer></script>` : ''}
  <title>${html(fullTitle)}</title>
</head>
<body class="page-${page}">
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="site-wrap">
    <header class="site-header">
      <a class="brand" href="${url()}" aria-label="${html(config.name)}，返回首页"><span class="brand-mark" aria-hidden="true">✳</span><span>${html(config.name)}<small>PERSONAL ESSAYS</small></span></a>
      <nav aria-label="主导航"><a href="${url()}"${page === 'home' ? ' aria-current="page"' : ''}>首页</a><a href="${url('archive/')}"${page === 'archive' ? ' aria-current="page"' : ''}>文章归档</a><a href="${url('about/')}"${page === 'about' ? ' aria-current="page"' : ''}>关于</a><a href="${url('write/')}"${page === 'write' ? ' aria-current="page"' : ''}>写随笔</a></nav>
    </header>
    <main id="main">${content}</main>
    <footer class="site-footer"><p>${html(config.footer)} <span>© ${year} ${html(config.author)}</span></p><a href="${url('feed.xml')}">RSS 订阅 ↗</a></footer>
  </div>
</body>
</html>`;
}

const filenames = fs.readdirSync(postsDir).filter(name => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name));
const seenSlugs = new Set();
const posts = filenames.map(filename => {
  const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8');
  const { data, content } = matter(raw);
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? filename.slice(0, 10));
  const slug = String(data.slug ?? filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!data.title || !validDate || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`${filename}: title, date (YYYY-MM-DD), or slug is invalid`);
  }
  if (seenSlugs.has(slug)) throw new Error(`Duplicate slug: ${slug}`);
  seenSlugs.add(slug);
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? [String(data.tags)] : [];
  const time = String(data.time ?? '').trim();
  const location = String(data.location ?? '').trim();
  if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${filename}: time must be HH:mm`);
  if (location.length > 100) throw new Error(`${filename}: location is too long`);
  return { title: String(data.title), date, time, location, slug, summary: String(data.summary ?? ''), tags,
    minutes: readMinutes(content), body: markdown(content) };
}).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.title.localeCompare(b.title));

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const asset of fs.readdirSync(path.join(root, 'assets'))) {
  const source = path.join(root, 'assets', asset);
  if (fs.statSync(source).isFile()) fs.copyFileSync(source, path.join(output, 'assets', asset));
}
const vendor = path.join(output, 'assets', 'vendor');
fs.mkdirSync(vendor, { recursive: true });
for (const [source, target] of [
  ['marked/lib/marked.umd.js', 'marked.umd.js'],
  ['dompurify/dist/purify.min.js', 'purify.min.js'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['turndown/dist/turndown.js', 'turndown.js']
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(vendor, target));
const licenses = path.join(vendor, 'licenses');
fs.mkdirSync(licenses, { recursive: true });
for (const [source, target] of [
  ['marked/LICENSE.md', 'marked.txt'],
  ['dompurify/LICENSE', 'dompurify.txt'],
  ['mammoth/LICENSE', 'mammoth.txt'],
  ['turndown/LICENSE', 'turndown.txt']
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(licenses, target));
fs.writeFileSync(path.join(output, '.nojekyll'), '');

function postCard(post, index) {
  return `<article class="post-card"><div class="post-card-no">${String(index + 1).padStart(2, '0')}</div><div class="post-card-body"><div class="post-meta">${metaLine(post)}</div><h3><a href="${url(`essays/${post.slug}/`)}">${html(post.title)}</a></h3><p>${html(post.summary)}</p><div class="post-card-bottom">${tagsMarkup(post.tags)}<a class="text-link" href="${url(`essays/${post.slug}/`)}" aria-label="阅读《${html(post.title)}》">阅读全文 <span aria-hidden="true">↗</span></a></div></div></article>`;
}

const timelineYears = Map.groupBy(posts, post => post.date.slice(0, 4));
const timelineEntries = [...timelineYears].map(([yearKey, yearPosts]) => `<div class="timeline-year-group"><h3 class="timeline-year">${yearKey}<small>年</small></h3><div class="timeline-items">${yearPosts.map(post => `<article class="timeline-entry"><div class="timeline-time"><time datetime="${post.date}${post.time ? `T${post.time}:00+08:00` : ''}"><strong>${post.date.slice(5).replace('-', '.')}</strong><span>${post.time ? html(post.time) : '时刻未记录'}</span></time></div><div class="timeline-rail"><span class="timeline-dot"></span></div><div class="timeline-card"><div class="timeline-card-top">${placeMarkup(post, 'timeline-place')}<span>${post.minutes} 分钟阅读</span></div><h4><a href="${url(`essays/${post.slug}/`)}">${html(post.title)}</a></h4><p>${html(post.summary)}</p><div class="timeline-card-bottom"><div>${tagsMarkup(post.tags)}</div><a href="${url(`essays/${post.slug}/`)}" aria-label="阅读《${html(post.title)}》">读这篇随笔 ↗</a></div></div></article>`).join('')}</div></div>`).join('');
const home = `<section class="timeline-hero" aria-labelledby="timeline-hero-title"><div class="timeline-hero-copy"><p class="eyebrow">TIME NOTES / 我的时间链路</p><h1 id="timeline-hero-title">时间有迹，<br><em>文字有处可去。</em></h1><p>沿着时间往回走，读那时写下的随笔，也记住它发生的地方。</p><a class="primary-link" href="${url('write/')}">写下此刻 <span aria-hidden="true">↗</span></a></div><div class="timeline-hero-art" aria-hidden="true"><div class="timeline-orbit"><span class="orbit-center">此刻</span><i class="orbit-dot orbit-dot-one"></i><i class="orbit-dot orbit-dot-two"></i><i class="orbit-dot orbit-dot-three"></i></div><span class="orbit-caption">每个时刻<br>都值得留下</span></div></section>
<section class="timeline-section" aria-labelledby="timeline-title"><div class="section-head"><div><p class="eyebrow">THE TIMELINE / 时间链路</p><h2 id="timeline-title">沿着时间，慢慢读</h2></div><span class="timeline-count">${posts.length} 个时间节点</span></div>${posts.length ? `<div class="timeline-list">${timelineEntries}</div>` : `<div class="timeline-empty"><p>时间链路还没有节点。</p><a href="${url('write/')}">写下第一篇随笔 ↗</a></div>`}<div class="timeline-end"><span>✳</span><p>时间在继续，下一篇也会来到这里。</p><a href="${url('archive/')}">查看文章归档 ↗</a></div></section>`;
writePage('index.html', shell({ title: '', description: config.description, canonical: absolute(), page: 'home', content: home }));

const byYear = Map.groupBy(posts, post => post.date.slice(0, 4));
const archive = `<section class="page-heading"><p class="eyebrow">ALL WORDS / 所有文字</p><h1>文章归档<span class="title-period">。</span></h1><p>沿着时间往回走，看看曾经写下的想法。</p></section>
<section class="archive-content"><div class="archive-tools"><span>共 ${posts.length} 篇文章</span><label class="search-box"><span aria-hidden="true">⌕</span><span class="sr-only">搜索文章</span><input id="post-search" type="search" placeholder="搜索标题、简介或标签" autocomplete="off"></label></div>
<div id="archive-list">${[...byYear].map(([yearKey, yearPosts]) => `<div class="year-group"><h2>${yearKey}<span>年</span></h2><div class="year-posts">${yearPosts.map(post => `<a class="archive-row" href="${url(`essays/${post.slug}/`)}" data-search="${html(`${post.title} ${post.summary} ${post.tags.join(' ')}`.toLowerCase())}"><time datetime="${post.date}">${post.date.slice(5).replace('-', '.')}</time><span class="archive-title">${html(post.title)}</span><span class="archive-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></div>`).join('')}</div><p id="search-empty" class="empty-note" hidden>没有找到匹配的文章，换个关键词试试。</p></section>`;
writePage('archive/index.html', shell({ title: '文章归档', description: '浏览所有随笔和日常记录。', canonical: absolute('archive/'), page: 'archive', content: archive }));

const aboutBody = markdown(fs.readFileSync(path.join(root, 'about.md'), 'utf8'));
const about = `<section class="page-heading"><p class="eyebrow">A LITTLE ABOUT / 关于</p><h1>关于这里<span class="title-period">。</span></h1><p>有些话，写下来才知道自己在想什么。</p></section><section class="about-layout"><div class="about-quote" aria-hidden="true"><span>“</span><p>写下来，<br>慢慢看。</p><i>${html(config.name)} · ${year}</i></div><div class="prose about-prose">${aboutBody}</div></section>`;
writePage('about/index.html', shell({ title: '关于', description: `关于${config.name}和这里的文字。`, canonical: absolute('about/'), page: 'about', content: about }));

const writing = `<section class="page-heading write-heading"><p class="eyebrow">WRITE YOUR WORDS / 写随笔</p><h1>把今天写下来<span class="title-period">。</span></h1><p>直接写，或导入写好的文件。草稿留在这台设备，发布后出现在文章列表。</p></section>
<section id="writing-app" class="writing-app" data-base-path="${html(basePath)}" data-site-url="${html(siteUrl)}" data-owner="htf100" data-repo="suibi">
  <div class="writing-topbar"><div><strong>我的草稿</strong><span id="draft-count">0 篇</span></div><div class="writing-top-actions"><button id="new-draft" type="button">＋ 新建</button><label class="import-button" for="import-file">↑ 导入文件</label><input id="import-file" type="file" accept=".md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></div></div>
  <div class="writing-layout"><aside class="draft-panel" aria-label="草稿列表"><div id="draft-list" class="draft-list"></div><p class="draft-note">草稿只保存在当前浏览器。换设备前请下载 Markdown 备份。</p></aside>
  <div class="editor-panel"><div class="editor-meta"><label>标题<input id="essay-title" type="text" maxlength="100" placeholder="给这篇随笔起个名字"></label><div class="editor-meta-row date-time-row"><label>写作日期<input id="essay-date" type="date"></label><label>写作时间<input id="essay-time" type="time"></label></div><div class="editor-meta-row place-row"><label>写作地点<input id="essay-location" type="text" maxlength="100" placeholder="例如：图书馆三楼、教学楼 A 座"></label><label>标签 <small>用逗号分开</small><input id="essay-tags" type="text" placeholder="日常, 阅读"></label></div><div class="location-picker"><div class="location-picker-top"><button id="locate-now" type="button" class="soft-button">◎ 获取当前位置</button><span id="location-status" role="status" aria-live="polite">选择附近地点后可继续修改；公开时只显示地点名称。</span></div><div id="location-suggestions" class="location-suggestions" aria-label="附近地点候选" hidden></div><p class="location-credit">点击定位后，坐标会发送给 <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a> 查询附近地点。地点资料来自 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap 贡献者</a>；坐标不会存入草稿或文章。</p></div><label>一句话简介 <small>可留空</small><input id="essay-summary" type="text" maxlength="180" placeholder="这篇文章想说什么？"></label><label>文章地址 <small>小写英文、数字和短横线</small><input id="essay-slug" type="text" pattern="[a-z0-9-]+" placeholder="例如 my-first-essay"></label></div>
  <div class="editor-toolbar"><span>正文</span><div><button type="button" data-insert="heading" title="小标题">标题</button><button type="button" data-insert="bold" title="加粗">加粗</button><button type="button" data-insert="quote" title="引用">引用</button><button type="button" data-insert="list" title="列表">列表</button><button type="button" data-insert="link" title="链接">链接</button></div></div>
  <div class="writing-columns"><label class="editor-body-label"><span class="sr-only">随笔正文</span><textarea id="essay-body" spellcheck="true" placeholder="从今天的一句话开始写……"></textarea></label><div class="preview-panel"><div class="preview-label">实时预览</div><div id="essay-preview" class="prose"></div></div></div>
  <div class="editor-actions"><div id="save-status" class="save-status" role="status">还没有内容</div><div><button id="delete-draft" type="button" class="muted-button">删除草稿</button><button id="download-draft" type="button" class="muted-button">下载 Markdown</button><button id="save-draft" type="button" class="soft-button">保存草稿</button><button id="open-publish" type="button" class="publish-button">发布到网站 ↗</button></div></div>
  <section id="publish-panel" class="publish-panel" hidden aria-labelledby="publish-title"><div class="publish-head"><div><p class="eyebrow">GITHUB PUBLISHING</p><h2 id="publish-title">发布这篇随笔</h2></div><button id="close-publish" type="button" aria-label="关闭发布区">×</button></div><p>首次使用，请<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">创建 GitHub 细粒度令牌 ↗</a>：账号选 <strong>htf100</strong>，仓库仅选 <strong>suibi</strong>，将 <strong>Contents</strong> 设为 <strong>Read and write</strong>。令牌只在当前页面使用，不保存到草稿或浏览器存储。</p><label>GitHub 令牌<input id="github-token" type="password" autocomplete="off" placeholder="粘贴 GitHub 令牌"></label><div class="publish-controls"><button id="confirm-publish" type="button" class="publish-button">确认发布</button><span id="publish-status" role="status" aria-live="polite"></span></div></section>
  </div></div>
</section>`;
writePage('write/index.html', shell({ title: '写随笔', description: '写作、保存草稿或导入文件。', canonical: absolute('write/'), page: 'write', content: writing }));

for (let i = 0; i < posts.length; i++) {
  const post = posts[i];
  const previous = posts[i + 1];
  const next = posts[i - 1];
  const content = `<article class="essay"><header class="essay-header"><a class="back-link" href="${url('archive/')}" aria-label="返回文章归档">← 返回文章归档</a><div class="post-meta">${metaLine(post)}</div><h1>${html(post.title)}</h1><p class="essay-summary">${html(post.summary)}</p><div class="essay-location">${placeMarkup(post)}</div><div class="essay-tags">${tagsMarkup(post.tags)}</div></header><div class="prose essay-body">${post.body}</div><footer class="essay-footer"><div class="essay-endmark" aria-label="文章结束">✳</div><p>写于 ${dateLabel(post.date)}${post.time ? ` ${html(post.time)}` : ''} · ${html(post.location || '地点未记录')}</p><div class="essay-nav">${previous ? `<a href="${url(`essays/${previous.slug}/`)}"><small>上一篇</small><strong>← ${html(previous.title)}</strong></a>` : '<span></span>'}${next ? `<a href="${url(`essays/${next.slug}/`)}"><small>下一篇</small><strong>${html(next.title)} →</strong></a>` : '<span></span>'}</div></footer></article>`;
  writePage(`essays/${post.slug}/index.html`, shell({ title: post.title, description: post.summary || config.description, canonical: absolute(`essays/${post.slug}/`), page: 'essay', content, article: true }));
}

const rssItems = posts.slice(0, 20).map(post => `<item><title>${xml(post.title)}</title><link>${xml(absolute(`essays/${post.slug}/`))}</link><guid>${xml(absolute(`essays/${post.slug}/`))}</guid><description>${xml(post.summary)}</description><pubDate>${new Date(`${post.date}T${post.time || '12:00'}:00+08:00`).toUTCString()}</pubDate></item>`).join('');
writePage('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(config.name)}</title><link>${xml(absolute())}</link><description>${xml(config.description)}</description><language>zh-CN</language>${rssItems}</channel></rss>`);
writePage('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', 'archive/', 'about/', ...posts.map(post => `essays/${post.slug}/`)].map(part => `<url><loc>${xml(absolute(part))}</loc></url>`).join('')}</urlset>`);
writePage('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`);
console.log(`Built ${posts.length} posts at ${output} for ${basePath}`);
