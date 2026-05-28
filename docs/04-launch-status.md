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
http://localhost:1313/personal-blog/
```

已通过 HTTP 检查：

- `GET /personal-blog/` 返回 `200 OK`。
- `GET /personal-blog/posts/hello-blog/` 返回 `200 OK`。
- `GET /personal-blog/images/home-hero.png` 返回 `200 OK`。

已扫描 `public/**/*.html` 中的站内链接和资源路径，缺失数量为 `0`。

## 上线前还需要你提供

| 项目 | 例子 | 用途 |
|---|---|---|
| GitHub 用户名 | `octocat` | 生成 GitHub Pages 地址 |
| 仓库名 | `personal-blog` 或 `octocat.github.io` | 创建远程仓库和配置 `baseURL` |
| 博客标题 | `Chenglin's Notes` | 替换 `hugo.toml` 的 `title` |
| 作者名 | `Chenglin` | 页脚和作者信息 |
| 联系方式 | GitHub、邮箱等 | 替换页脚和关于页 |

## 绑定 GitHub 的下一步

如果使用项目页：

```bash
git remote add origin git@github.com:<github-username>/<repository-name>.git
git push -u origin main
```

如果使用用户主页：

```bash
git remote add origin git@github.com:<github-username>/<github-username>.github.io.git
git push -u origin main
```

推送后到 GitHub 仓库：

1. 打开 `Settings`。
2. 打开 `Pages`。
3. `Source` 选择 `GitHub Actions`。
4. 到 `Actions` 页面等待 `Deploy Hugo site to Pages` 成功。

## 当前阻塞

当前无法直接完成 GitHub 上线，因为本机没有 `gh` 命令，且还没有确定 GitHub 用户名和目标仓库名。拿到这两个信息后，可以继续配置 `hugo.toml`、添加远程仓库、推送并等待 GitHub Pages 部署。

