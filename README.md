# 我的随笔-tf

一个可发布到 GitHub Pages 的个人随笔网站。文章写成 Markdown 文件，推送到 GitHub 后自动生成首页、归档、正文、RSS 和站点地图。网站无数据库，访客无需登录。

## 写一篇随笔

在 GitHub 仓库的 `posts` 文件夹点击 **Add file → Create new file**，按 `年-月-日-英文名.md` 命名，例如 `2026-09-24-autumn-walk.md`，填写：

```md
---
title: 秋天的散步
date: 2026-09-24
summary: 这篇随笔的一句话简介，会显示在首页和归档中。
tags: [日常, 散步]
slug: autumn-walk
---

从这里开始写正文。支持 **加粗**、[链接](https://example.com)、列表、引用和图片。
```

点 **Commit changes** 保存到 `main`，等 GitHub Actions 完成，网站就会更新。`slug` 用小写英文字母、数字和短横线，写好后尽量别改，否则文章地址会变。图片放进 `assets`，文章里写 `![图片说明]({{baseurl}}assets/文件名.jpg)`。

仓库中现有的两篇文章是**示例**。开始写自己的随笔后，可以修改或删除 `posts/2026-09-23-welcome.md` 和 `posts/2026-09-22-another-day.md`。

## 改网站信息

- 网站名、笔名、首页短句：编辑 `site.json`。
- “关于”页：编辑 `about.md`。
- 配色、字号、布局：编辑 `assets/style.css`。

## 本地预览

需要 Node.js 22 或更新版本，以及 Python 3：

```bash
npm ci
npm run preview
```

打开 `http://localhost:8080/`。构建后的文件在 `dist/`，不需要提交。

## 发布到 GitHub Pages

此项目配置为 `htf100/suibi`，目标地址是 `https://htf100.github.io/suibi/`。

1. 用 `htf100` 登录 GitHub，新建公开仓库 `suibi`。
2. 把本目录中的文件推送到仓库的 `main` 分支。
3. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
4. 打开 **Actions** 等待 `Deploy essays` 成功，再访问网站地址。

如果仓库名或域名变了，要同步修改 `.github/workflows/pages.yml` 中的 `BASE_PATH` 和 `SITE_URL`。根域名发布时 `BASE_PATH` 应为 `/`。
