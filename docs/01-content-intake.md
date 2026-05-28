# 个人博客内容准备清单

这份清单用于在开发前明确需要你提供或确认的信息。当前站点会先用占位内容跑通本地预览和 GitHub Pages 部署链路，之后可以逐项替换为真实内容。

## 必填信息

| 项目 | 说明 | 当前占位 |
|---|---|---|
| GitHub 用户名 | 用于确定 GitHub Pages 域名。个人主页仓库通常是 `<username>.github.io`。 | `Ethan-rookie` |
| 仓库名 | 如果使用项目页，域名是 `https://<username>.github.io/<repo>/`。如果使用个人主页仓库，仓库名是 `<username>.github.io`。 | `Ethan-rookie.github.io` |
| 博客名称 | 页面标题、导航和浏览器标题。 | `Ethan-rookie 的个人博客` |
| 一句话介绍 | 首页首屏文案。建议 20-40 字。 | `记录工程实践、产品思考和长期项目。` |
| 作者名称 | 文章作者和页脚展示。 | `Ethan-rookie` |
| 联系方式 | GitHub、邮箱、X、LinkedIn、微信公众号等任选。 | GitHub 占位链接 |

## 推荐补充信息

| 项目 | 用途 | 建议格式 |
|---|---|---|
| 头像或个人照片 | 关于页、首页视觉识别。 | 方图，至少 512x512 |
| 首页背景图 | 第一屏视觉资产。没有素材时可先使用生成图。 | 横图，建议 1600x900 |
| 个人简介 | 关于页正文。 | 2-5 段短文 |
| 技术标签 | 首页和文章列表筛选感知。 | 例如 `AI Infra`、`macOS`、`Hugo` |
| 代表项目 | 项目页展示。 | 名称、简介、链接、截图 |
| 首批文章 | 让上线版本看起来完整。 | 3-5 篇 Markdown |
| 自定义域名 | 如果不用 GitHub 默认域名，需要 DNS 配置。 | 例如 `blog.example.com` |

## 首批内容建议

上线前建议至少准备这些内容：

1. `关于我`：身份、长期关注方向、联系方式。
2. `第一篇文章`：说明博客会记录什么，作为时间起点。
3. `项目页`：展示一个正在做或已经发布的项目。
4. `站点说明`：写清楚技术栈和部署方式，方便后续维护。

## GitHub Pages 域名选择

| 类型 | 仓库名 | 访问地址 | 适用场景 |
|---|---|---|---|
| 用户主页 | `<username>.github.io` | `https://<username>.github.io/` | 只做一个主博客，地址最短 |
| 项目页 | 任意仓库名，如 `personal-blog` | `https://<username>.github.io/personal-blog/` | 不想占用用户主页仓库 |
| 自定义域名 | 任意仓库名 | `https://blog.example.com/` | 已有域名并希望品牌化 |

当前工程已按 GitHub 用户主页准备，`hugo.toml` 的 `baseURL` 是：

```toml
baseURL = "https://ethan-rookie.github.io/"
```

如果后续改成项目页，再把 `baseURL` 改成 `https://ethan-rookie.github.io/<repository-name>/`。
