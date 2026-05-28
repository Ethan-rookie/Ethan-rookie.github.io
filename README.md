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

## Before Publishing

Update `hugo.toml`:

- `baseURL`
- `title`
- `[params] author`
- social links

Deployment details are in [docs/03-local-and-github-pages.md](docs/03-local-and-github-pages.md).

