# 本地开发与 GitHub Pages 上线 Runbook

## 1. 本地预览

进入博客目录：

```bash
cd /Users/chenglin/selfvibe/blog
```

启动开发服务器：

```bash
hugo server --buildDrafts --disableFastRender
```

浏览器访问：

```text
http://localhost:1313/
```

## 2. 本地构建检查

构建静态文件：

```bash
hugo --minify
```

构建产物会生成到：

```text
blog/public/
```

`public/` 是生成产物，不提交到源码仓库。

上线前可以额外跑链接检查：

```bash
hugo --gc --minify --destination /tmp/ethan-rookie-blog-public
node scripts/check_site_links.mjs /tmp/ethan-rookie-blog-public /
```

也可以直接运行完整上线前检查：

```bash
./scripts/preflight_launch.sh
```

## 3. 替换上线信息

编辑 `hugo.toml`：

```toml
baseURL = "https://ethan-rookie.github.io/"
title = "Ethan-rookie 的个人博客"
```

当前按 GitHub 用户主页仓库配置。仓库名必须是：

```text
Ethan-rookie.github.io
```

## 4. 初始化博客 Git 仓库

如果 `blog/` 目录还不是 Git 仓库：

```bash
cd /Users/chenglin/selfvibe/blog
git init
git add .
git commit -m "Initial Hugo personal blog"
```

## 5. 创建 GitHub 仓库

推荐两种方式二选一：

| 类型 | 仓库名 | 说明 |
|---|---|---|
| 用户主页 | `Ethan-rookie.github.io` | 域名最短，只能有一个 |
| 项目页 | `personal-blog` | 更灵活，地址包含仓库路径 |

创建远程仓库后关联：

```bash
git remote add origin git@github.com:Ethan-rookie/Ethan-rookie.github.io.git
git branch -M main
git push -u origin main
```

## 6. 开启 GitHub Pages

进入 GitHub 仓库：

1. 打开 `Settings`。
2. 打开 `Pages`。
3. `Build and deployment` 的 `Source` 选择 `GitHub Actions`。
4. 回到 `Actions` 页面等待 `Deploy Hugo site to Pages` 运行成功。

如果 `git push` 前想确认状态，运行：

```bash
./scripts/preflight_launch.sh
```

全部显示 `[OK]` 后再推送。

## 7. 自定义域名可选

如果使用自定义域名，需要：

1. 在 GitHub Pages 设置中填写域名。
2. 在 DNS 服务商添加记录。

常见配置：

```text
CNAME blog.example.com -> Ethan-rookie.github.io
```

如果根域名使用 GitHub Pages，需要按 GitHub 当前文档配置 A/AAAA 记录。DNS 记录可能变动，上线前应以 GitHub Pages 设置页提示为准。

## 8. 上线验收

上线后检查：

- 首页能打开。
- 文章页和项目页 URL 正常。
- CSS 和图片没有 404。
- 移动端导航可读。
- GitHub Actions 最近一次部署成功。
- 搜索引擎描述和站点标题符合预期。
