# Personal Blog

Hugo-based personal blog prepared for GitHub Pages.

## Local Development

```bash
hugo server --buildDrafts --disableFastRender
```

Open:

```text
http://localhost:1313/
```

## Production Build

```bash
hugo --minify
```

Generated files are written to `public/`.

For a clean deploy-style check:

```bash
hugo --gc --minify --destination /tmp/ethan-rookie-blog-public
node scripts/check_site_links.mjs /tmp/ethan-rookie-blog-public /
```

Before pushing to GitHub:

```bash
./scripts/preflight_launch.sh
```

## Before Publishing

Update `hugo.toml`:

- `baseURL = "https://ethan-rookie.github.io/"`
- `title = "Ethan-rookie 的个人博客"`
- `[params] author = "Ethan-rookie"`
- social links

Deployment details are in [docs/03-local-and-github-pages.md](docs/03-local-and-github-pages.md).
