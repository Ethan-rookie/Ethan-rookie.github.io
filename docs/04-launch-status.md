# 当前上线状态与待办

## 已完成

- 已在 `blog/` 下创建独立 Hugo 站点。
- 已先写文档，再实现站点骨架。
- 已创建首页、文章列表、文章详情、项目列表、项目详情和关于页。
- 已添加项目内自定义布局和样式，不依赖外部 Hugo 主题下载。
- 已添加首页 hero 图片：`static/images/home-hero.png`。
- 已添加 GitHub Pages workflow：`.github/workflows/hugo.yml`。
- 已初始化 `blog/` 为独立 Git 仓库。
- 已提交初始版本：`Initial Hugo personal blog`。
- 已配置本地 Git remote：`git@github.com:Ethan-rookie/Ethan-rookie.github.io.git`。
- 已新增上线前检查脚本：`scripts/preflight_launch.sh`。
- 已创建 GitHub 仓库：`https://github.com/Ethan-rookie/Ethan-rookie.github.io`。
- 已推送 `main` 分支到 GitHub。
- 已把 GitHub Pages 切换到 `workflow` 部署模式。
- 已通过 GitHub Actions 部署 Hugo 站点。

## 已验证

本地 Hugo 版本：

```text
hugo v0.162.0+extended
```

生产构建命令：

```bash
hugo --gc --minify --cacheDir /tmp/selfvibe-hugo-cache
```

构建结果：

```text
Pages: 32
Static files: 1
Warnings: 0
```

本地预览地址：

```text
http://localhost:1313/
```

已通过 HTTP 检查：

- `GET https://ethan-rookie.github.io/` 返回 `200 OK`。
- `GET https://ethan-rookie.github.io/posts/hello-blog/` 返回 `200 OK`。
- `GET https://ethan-rookie.github.io/images/home-hero.png` 返回 `200 OK`。
- 线上首页 HTML 已确认为 Hugo 产物，包含 `Hugo 0.162.0` generator。

已通过 `scripts/check_site_links.mjs` 扫描生产构建目录中的站内链接和资源路径，缺失数量为 `0`。

上线前检查脚本当前结果：

```text
GitHub repository exists
GitHub SSH authentication works
Hugo production build succeeded
Generated site links resolve
```

## 后续可替换内容

| 项目 | 例子 | 用途 |
|---|---|---|
| GitHub 用户名 | `Ethan-rookie` | 已配置 |
| 仓库名 | `Ethan-rookie.github.io` | 已创建 |
| 博客标题 | `Ethan-rookie 的个人博客` | 已配置 |
| 作者名 | `Ethan-rookie` | 已配置 |
| 联系方式 | GitHub、邮箱等 | 替换页脚和关于页 |

## 已绑定 GitHub

本地 remote：

```text
git@github.com:Ethan-rookie/Ethan-rookie.github.io.git
```

线上地址：

```text
https://ethan-rookie.github.io/
```

后续更新流程：

1. 修改 `content/`、`layouts/`、`assets/` 或配置。
2. 本地运行 `./scripts/preflight_launch.sh`。
3. 提交并 `git push`。
4. 等待 `Deploy Hugo site to Pages` workflow 成功。

## 当前阻塞

无。当前博客已经通过 GitHub Pages 上线。
