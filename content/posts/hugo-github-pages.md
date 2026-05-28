+++
title = "Hugo + GitHub Pages 部署记录"
date = 2026-05-27
description = "记录当前博客的本地开发和 GitHub Pages 部署方式。"
tags = ["Hugo", "部署", "GitHub Actions"]
draft = false
+++

当前博客采用 Hugo 生成静态站点，并通过 GitHub Actions 发布到 GitHub Pages。

本地开发只需要运行：

```bash
hugo server --buildDrafts --disableFastRender
```

生产构建使用：

```bash
hugo --minify
```

上线前最重要的配置是 `hugo.toml` 中的 `baseURL`。如果使用项目页，地址需要包含仓库名；如果使用用户主页仓库，地址只需要到 `<username>.github.io/`。

