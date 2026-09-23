import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

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
function markdown(value) { return marked.parse(value.replaceAll('{{baseurl}}', basePath)); }
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
  return `<span>${dateLabel(post.date)}</span><span class="meta-dot" aria-hidden="true"></span><span>${post.minutes} 分钟阅读</span>`;
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
  <link rel="stylesheet" href="${url('assets/style.css')}">
  <script src="${url('assets/site.js')}" defer></script>
  <title>${html(fullTitle)}</title>
</head>
<body class="page-${page}">
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="site-wrap">
    <header class="site-header">
      <a class="brand" href="${url()}" aria-label="${html(config.name)}，返回首页"><span class="brand-mark" aria-hidden="true">✳</span><span>${html(config.name)}<small>PERSONAL ESSAYS</small></span></a>
      <nav aria-label="主导航"><a href="${url()}"${page === 'home' ? ' aria-current="page"' : ''}>首页</a><a href="${url('archive/')}"${page === 'archive' ? ' aria-current="page"' : ''}>文章归档</a><a href="${url('about/')}"${page === 'about' ? ' aria-current="page"' : ''}>关于</a></nav>
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
  return { title: String(data.title), date, slug, summary: String(data.summary ?? ''), tags,
    minutes: readMinutes(content), body: markdown(content) };
}).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const asset of fs.readdirSync(path.join(root, 'assets'))) {
  fs.copyFileSync(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');

function postCard(post, index) {
  return `<article class="post-card"><div class="post-card-no">${String(index + 1).padStart(2, '0')}</div><div class="post-card-body"><div class="post-meta">${metaLine(post)}</div><h3><a href="${url(`essays/${post.slug}/`)}">${html(post.title)}</a></h3><p>${html(post.summary)}</p><div class="post-card-bottom">${tagsMarkup(post.tags)}<a class="text-link" href="${url(`essays/${post.slug}/`)}" aria-label="阅读《${html(post.title)}》">阅读全文 <span aria-hidden="true">↗</span></a></div></div></article>`;
}

const latest = posts.slice(0, 4);
const home = `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-copy"><p class="eyebrow"><span class="eyebrow-line"></span> 一处慢慢写字的地方</p><h1 id="hero-title">把日子写成<br><em>可回看的句子。</em></h1><p class="hero-intro">${html(config.tagline)}<br>这里收集日常、阅读，以及那些暂时没有答案的想法。</p><div class="hero-actions"><a class="primary-link" href="${url('archive/')}">读一篇随笔 <span aria-hidden="true">↗</span></a><span class="hero-count">已收录 <strong>${posts.length}</strong> 篇文字</span></div></div>
  <div class="hero-art" aria-hidden="true"><div class="art-sun"></div><div class="art-mountain art-mountain-back"></div><div class="art-mountain art-mountain-front"></div><div class="art-label">A QUIET PLACE<br>TO KEEP WORDS</div><div class="art-stamp">随<br>笔</div></div>
</section>
<section class="home-section" aria-labelledby="latest-title"><div class="section-head"><div><p class="eyebrow">RECENT WRITING / 近期文字</p><h2 id="latest-title">最近写下的</h2></div><a href="${url('archive/')}">查看全部文章 <span aria-hidden="true">↗</span></a></div><div class="post-list">${latest.length ? latest.map(postCard).join('') : '<p class="empty-note">还没有文章。第一篇文字，等你写下。</p>'}</div></section>
<section class="closing-note"><span class="closing-icon" aria-hidden="true">✳</span><p>不必写得很完整。<br><strong>让念头先有一个落脚的地方。</strong></p><a href="${url('about/')}">关于这个地方 ↗</a></section>`;
writePage('index.html', shell({ title: '', description: config.description, canonical: absolute(), page: 'home', content: home }));

const byYear = Map.groupBy(posts, post => post.date.slice(0, 4));
const archive = `<section class="page-heading"><p class="eyebrow">ALL WORDS / 所有文字</p><h1>文章归档<span class="title-period">。</span></h1><p>沿着时间往回走，看看曾经写下的想法。</p></section>
<section class="archive-content"><div class="archive-tools"><span>共 ${posts.length} 篇文章</span><label class="search-box"><span aria-hidden="true">⌕</span><span class="sr-only">搜索文章</span><input id="post-search" type="search" placeholder="搜索标题、简介或标签" autocomplete="off"></label></div>
<div id="archive-list">${[...byYear].map(([yearKey, yearPosts]) => `<div class="year-group"><h2>${yearKey}<span>年</span></h2><div class="year-posts">${yearPosts.map(post => `<a class="archive-row" href="${url(`essays/${post.slug}/`)}" data-search="${html(`${post.title} ${post.summary} ${post.tags.join(' ')}`.toLowerCase())}"><time datetime="${post.date}">${post.date.slice(5).replace('-', '.')}</time><span class="archive-title">${html(post.title)}</span><span class="archive-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></div>`).join('')}</div><p id="search-empty" class="empty-note" hidden>没有找到匹配的文章，换个关键词试试。</p></section>`;
writePage('archive/index.html', shell({ title: '文章归档', description: '浏览所有随笔和日常记录。', canonical: absolute('archive/'), page: 'archive', content: archive }));

const aboutBody = markdown(fs.readFileSync(path.join(root, 'about.md'), 'utf8'));
const about = `<section class="page-heading"><p class="eyebrow">A LITTLE ABOUT / 关于</p><h1>关于这里<span class="title-period">。</span></h1><p>有些话，写下来才知道自己在想什么。</p></section><section class="about-layout"><div class="about-quote" aria-hidden="true"><span>“</span><p>写下来，<br>慢慢看。</p><i>${html(config.name)} · ${year}</i></div><div class="prose about-prose">${aboutBody}</div></section>`;
writePage('about/index.html', shell({ title: '关于', description: `关于${config.name}和这里的文字。`, canonical: absolute('about/'), page: 'about', content: about }));

for (let i = 0; i < posts.length; i++) {
  const post = posts[i];
  const previous = posts[i + 1];
  const next = posts[i - 1];
  const content = `<article class="essay"><header class="essay-header"><a class="back-link" href="${url('archive/')}" aria-label="返回文章归档">← 返回文章归档</a><div class="post-meta">${metaLine(post)}</div><h1>${html(post.title)}</h1><p class="essay-summary">${html(post.summary)}</p><div class="essay-tags">${tagsMarkup(post.tags)}</div></header><div class="prose essay-body">${post.body}</div><footer class="essay-footer"><div class="essay-endmark" aria-label="文章结束">✳</div><p>写于 ${dateLabel(post.date)}</p><div class="essay-nav">${previous ? `<a href="${url(`essays/${previous.slug}/`)}"><small>上一篇</small><strong>← ${html(previous.title)}</strong></a>` : '<span></span>'}${next ? `<a href="${url(`essays/${next.slug}/`)}"><small>下一篇</small><strong>${html(next.title)} →</strong></a>` : '<span></span>'}</div></footer></article>`;
  writePage(`essays/${post.slug}/index.html`, shell({ title: post.title, description: post.summary || config.description, canonical: absolute(`essays/${post.slug}/`), page: 'essay', content, article: true }));
}

const rssItems = posts.slice(0, 20).map(post => `<item><title>${xml(post.title)}</title><link>${xml(absolute(`essays/${post.slug}/`))}</link><guid>${xml(absolute(`essays/${post.slug}/`))}</guid><description>${xml(post.summary)}</description><pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate></item>`).join('');
writePage('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(config.name)}</title><link>${xml(absolute())}</link><description>${xml(config.description)}</description><language>zh-CN</language>${rssItems}</channel></rss>`);
writePage('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', 'archive/', 'about/', ...posts.map(post => `essays/${post.slug}/`)].map(part => `<url><loc>${xml(absolute(part))}</loc></url>`).join('')}</urlset>`);
writePage('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${absolute('sitemap.xml')}\n`);
console.log(`Built ${posts.length} posts at ${output} for ${basePath}`);
