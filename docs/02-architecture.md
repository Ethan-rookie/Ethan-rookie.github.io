# 技术方案与目录结构

## 方案选择

使用 Hugo 搭建静态个人博客。选择 Hugo 的原因：

- 构建产物是纯静态文件，适合 GitHub Pages。
- 内容使用 Markdown，迁移和长期维护成本低。
- 不依赖数据库、后端服务或运行时容器。
- 自定义布局可以放在当前仓库内，避免主题子模块或外部主题下载失败。

## 站点边界

当前根目录已有 `SelfVibeFace` 应用工程，因此博客放在独立的 `blog/` 子目录中。这个目录可以单独初始化 Git 仓库并推送到 GitHub Pages 仓库，不影响现有应用代码。

## 目录结构

```text
blog/
  hugo.toml                    # Hugo 配置
  README.md                    # 博客工程说明
  docs/                        # 方案、内容清单、上线流程
  content/                     # Markdown 内容
    _index.md                  # 首页内容
    about.md                   # 关于页
    projects/
    posts/
  layouts/                     # 自定义 Hugo 模板
    _default/
    partials/
  assets/
    css/main.css               # Hugo Pipes 处理的样式
  static/
    images/                    # 图片等静态资源
  .github/workflows/hugo.yml   # GitHub Pages 自动构建部署
```

## 内容模型

| 类型 | 路径 | 用途 |
|---|---|---|
| 首页 | `content/_index.md` | 首屏简介和精选内容入口 |
| 文章 | `content/posts/*.md` | 长期更新的博客文章 |
| 项目 | `content/projects/*.md` | 展示个人项目、产品或开源工作 |
| 关于 | `content/about.md` | 个人介绍和联系方式 |

文章 front matter 使用 TOML：

```toml
+++
title = "文章标题"
date = 2026-05-27
description = "一句话摘要"
tags = ["Hugo", "GitHub Pages"]
draft = false
+++
```

## 部署策略

GitHub Actions 在每次推送 `main` 分支时运行 Hugo 构建，并发布到 GitHub Pages。仓库需要在 GitHub Pages 设置中选择：

- Source: `GitHub Actions`
- Branch: 不需要手动选择 `gh-pages`

如果使用项目页，`baseURL` 必须包含仓库路径：

```toml
baseURL = "https://<github-username>.github.io/<repository-name>/"
```

如果使用用户主页仓库：

```toml
baseURL = "https://ethan-rookie.github.io/"
```

## 本地依赖

本地开发需要：

- Git
- Hugo extended

当前机器已检测到 Git，可通过 Homebrew 安装 Hugo：

```bash
brew install hugo
```
