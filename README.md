# 我的随笔-tf · 私人版

这是私人随笔网站的源码。前端仍由 GitHub Pages 提供，但随笔正文不再写入 GitHub 仓库或静态页面。登录由 Supabase Auth 负责，随笔存在 Supabase Postgres 中；数据库行级安全策略按作者账号限制读取、写入和删除。管理员可以邀请或停用账号，但网站内也只能看到自己的随笔。

**现有公开网站仍由 `main` 分支运行。** 私人版开发分支完成后台配置、账号登录和权限测试后，再合并到 `main`。构建流程要求后台配置齐全才会发布私人版。

## 功能

- 受邀邮箱登录；邀请链接首次进入后设置密码，支持密码重置。
- 每人独立的私人时间链路、草稿、写作页和 Markdown 备份。
- 可导入 `.md`、`.txt`、`.docx`；Word 图片暂不导入。
- 可选浏览器定位，选择附近地点名称，也可手动改写。点击定位才会把坐标发送给 Photon 查询 OpenStreetMap；数据库只保存地点名称。
- 管理员在网站里邀请、启用和停用账号。管理员界面不显示他人随笔。
- 旧版浏览器草稿可在登录后手动导入；导入成功才清除旧版浏览器副本。

## 配置 Supabase

1. 创建 Supabase 项目。Authentication → Sign In / Providers → Email 保持启用；关闭 **Allow new users to sign up** 和匿名登录。这样只有受邀账号能进入。
2. Authentication → URL Configuration 中将 Site URL 设置为 `https://htf100.github.io/suibi/`，并把同一地址加入 Redirect URLs。需要本地测试邀请时，再增加 `http://localhost:8080/`。
3. 在 SQL Editor 执行 [`supabase/migrations/202609230001_private_accounts.sql`](supabase/migrations/202609230001_private_accounts.sql)。这里创建成员表和随笔表，并启用行级安全策略。切勿给 `anon` 创建随笔读取策略，也不要添加“管理员可读全部随笔”的策略。
4. 在 Authentication → Users 邀请站点所有者的邮箱。创建邀请后，先从该用户详情复制 Auth user UUID，在 SQL Editor 中执行迁移文件末尾的 `insert into public.members ... role = 'owner'`，将这个 UUID 和邮箱替换进去，再打开邀请链接设置密码。不要用邮箱文本直接当权限依据。
5. 将 `supabase/functions/manage-members` 部署为 Edge Function。该函数设置 `verify_jwt = false`，但**每次请求都会调用 Auth 验证登录令牌，再核对 `members` 中的管理员身份**。设置函数秘密变量 `APP_URL=https://htf100.github.io/suibi/`。`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 通常由 Supabase 提供；如果项目使用新式密钥，另设 `SUPABASE_SECRET_KEY`。秘密密钥只允许放在函数环境，绝不能放进 GitHub Pages、仓库或浏览器。
6. 在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 添加 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`。这两个值是供浏览器使用的项目地址和公开密钥，安全边界由登录令牌与数据库策略承担。不要填 secret/service role key。
7. 使用两个不同受邀账号验证：A 只能读取、修改自己的随笔；B 只能读取、修改自己的随笔；管理员账号能邀请和停用成员，但列表及文章页只显示自己的随笔。确认后再把私人版分支合并到 `main`，等待 GitHub Pages 部署完成，然后核对旧文章 URL、RSS 和站点地图已消失。

**已公开过的文章无法靠登录功能变成秘密。** 它们可能仍在 Git 历史、搜索缓存或读者保存的副本中。当前仓库里的两篇文章只是示例；如果曾自行发布真实内容，要单独检查历史与缓存。

## 本地预览

需要 Node.js 22 或更高版本：

```bash
npm ci
```

在项目根目录创建不会提交到 Git 的 `.env.local`：

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

然后运行 `npm run preview`。

打开 `http://localhost:8080/`。不提供后台配置时，页面只显示“私人空间正在准备”。请使用测试项目与测试账号验证邀请、登录和权限。不要把真实服务密钥写进 `.env` 或提交到 GitHub。

## 安全边界

- GitHub Pages 仍向所有访问者发送页面代码；登录前不会发送私人随笔正文。真正的读取权限由 Supabase Auth 和 Postgres RLS 执行，不能只靠隐藏前端元素。
- 站点管理员的网页权限只包含成员管理和自己的随笔。Supabase 项目所有者通过数据库控制台仍可能读取数据；若需要连后台所有者都无法解读内容，必须另做端到端加密。
- 停用账号会阻止后续数据库请求，但无法收回该账号过去已下载、截图或打开在浏览器里的内容。
