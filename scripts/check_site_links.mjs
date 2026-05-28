import fs from "node:fs";
import path from "node:path";

const [rootArg = "public", baseArg = "/"] = process.argv.slice(2);
const root = path.resolve(rootArg);
const base = baseArg.endsWith("/") ? baseArg : `${baseArg}/`;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files);
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function targetExists(url) {
  const noQuery = url.split("?")[0].split("#")[0];
  const relative = decodeURI(noQuery.slice(base.length));
  const target = path.join(root, relative);
  return fs.existsSync(target) || fs.existsSync(path.join(target, "index.html"));
}

const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));
const refs = new Set();
const missing = [];
const refPattern = /(?:href|src)=['"]?([^'"\s>]+)|url\(['"]?([^)'"]+)/g;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  let match;

  while ((match = refPattern.exec(html))) {
    const raw = (match[1] || match[2] || "").replace(/&amp;/g, "&");
    if (
      !raw ||
      raw.startsWith("http") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("#") ||
      raw.startsWith("data:") ||
      raw.startsWith("/livereload.js")
    ) {
      continue;
    }

    if (!raw.startsWith(base)) {
      continue;
    }

    refs.add(raw);
    if (!targetExists(raw)) {
      missing.push({ file: path.relative(process.cwd(), file), url: raw });
    }
  }
}

console.log(
  JSON.stringify(
    {
      root: path.relative(process.cwd(), root) || ".",
      base,
      htmlFiles: htmlFiles.length,
      checkedRefs: refs.size,
      missing,
    },
    null,
    2,
  ),
);

if (missing.length > 0) {
  process.exit(1);
}

