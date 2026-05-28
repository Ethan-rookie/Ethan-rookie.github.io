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

- `GET /` 返回 `200 OK`。
- `GET /posts/hello-blog/` 返回 `200 OK`。
- `GET /images/home-hero.png` 返回 `200 OK`。

已通过 `scripts/check_site_links.mjs` 扫描生产构建目录中的站内链接和资源路径，缺失数量为 `0`。

## 上线前还需要你提供

| 项目 | 例子 | 用途 |
|---|---|---|
| GitHub 用户名 | `Ethan-rookie` | 已配置 |
| 仓库名 | `Ethan-rookie.github.io` | 需要在 GitHub 创建 |
| 博客标题 | `Ethan-rookie 的个人博客` | 已配置 |
| 作者名 | `Ethan-rookie` | 已配置 |
| 联系方式 | GitHub、邮箱等 | 替换页脚和关于页 |

## 绑定 GitHub 的下一步

本地 remote 已配置为用户主页仓库：

```bash
git push -u origin main
```

如果你后续想改成项目页，再使用：

```bash
git remote add origin git@github.com:Ethan-rookie/<repository-name>.git
git push -u origin main
```

推送后到 GitHub 仓库：

1. 打开 `Settings`。
2. 打开 `Pages`。
3. `Source` 选择 `GitHub Actions`。
4. 到 `Actions` 页面等待 `Deploy Hugo site to Pages` 成功。

## 当前阻塞

当前无法直接完成 GitHub 上线，因为本机没有 `gh` 命令，且 `ssh -T git@github.com` 返回 `Permission denied (publickey)`，说明本机 SSH key 尚未绑定到 GitHub 或当前 key 无权访问该账号。创建 `Ethan-rookie.github.io` 仓库并配置 SSH key 后，可以直接运行 `git push -u origin main` 并等待 GitHub Pages 部署。
