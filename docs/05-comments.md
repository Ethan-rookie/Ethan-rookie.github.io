# GitHub 登录留言功能

本站已接入 Giscus 评论组件。Giscus 基于 GitHub Discussions，访问者使用 GitHub 登录后留言，评论数据会存储在当前仓库的 Discussions 中。

## 当前配置

配置位置：

```text
hugo.toml
layouts/partials/comments.html
layouts/_default/single.html
```

当前只在 `content/posts/` 下的文章详情页显示评论区。项目页和关于页默认不显示。

Giscus 配置：

```toml
[params.comments]
  enabled = true

[params.giscus]
  repo = "Ethan-rookie/Ethan-rookie.github.io"
  repoId = "R_kgDOSqB_hA"
  category = "General"
  categoryId = "DIC_kwDOSqB_hM4C9_p6"
  mapping = "pathname"
```

## GitHub 侧状态

已完成：

- 仓库已公开。
- Discussions 已启用。
- 已使用 `General` 作为评论分类。

还需要确认：

- 安装 Giscus GitHub App，并只授权给 `Ethan-rookie/Ethan-rookie.github.io` 仓库。

安装地址：

```text
https://github.com/apps/giscus
```

## 单篇文章关闭评论

在文章 front matter 中添加：

```toml
comments = false
```

## 维护说明

- 评论和表情会进入 GitHub Discussions。
- 删除、置顶、锁定讨论都在 GitHub Discussions 后台完成。
- 如果以后换仓库或换 Discussions 分类，需要同步更新 `repoId` 和 `categoryId`。
