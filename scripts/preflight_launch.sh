#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}" || exit 1

EXPECTED_REMOTE="git@github.com:Ethan-rookie/Ethan-rookie.github.io.git"
REPO_PAGE="https://github.com/Ethan-rookie/Ethan-rookie.github.io"
VERIFY_DIR="${TMPDIR:-/tmp}/ethan-rookie-blog-public-preflight"
FAILED=0

pass() {
  printf '[OK] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAILED=1
}

info() {
  printf '[INFO] %s\n' "$1"
}

if command -v hugo >/dev/null 2>&1; then
  pass "Hugo is installed: $(hugo version | head -n 1)"
else
  fail "Hugo is not installed. Run: brew install hugo"
fi

if command -v node >/dev/null 2>&1; then
  pass "Node is installed: $(node --version)"
else
  fail "Node is not installed; link checking requires node."
fi

REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ "${REMOTE}" = "${EXPECTED_REMOTE}" ]; then
  pass "Git remote origin is ${EXPECTED_REMOTE}"
else
  fail "Git remote origin is '${REMOTE:-missing}', expected '${EXPECTED_REMOTE}'"
fi

if curl -fsSI "${REPO_PAGE}" >/dev/null 2>&1; then
  pass "GitHub repository exists: ${REPO_PAGE}"
else
  fail "GitHub repository is not reachable. Create ${REPO_PAGE} first."
fi

SSH_OUTPUT="$(ssh -T -o BatchMode=yes git@github.com 2>&1 || true)"
if printf '%s' "${SSH_OUTPUT}" | grep -q 'successfully authenticated'; then
  pass "GitHub SSH authentication works."
else
  fail "GitHub SSH authentication failed: ${SSH_OUTPUT}"
fi

if hugo --gc --minify --cleanDestinationDir --destination "${VERIFY_DIR}" --cacheDir /tmp/selfvibe-hugo-cache >/tmp/ethan-rookie-hugo-build.log 2>&1; then
  pass "Hugo production build succeeded."
else
  fail "Hugo production build failed. See /tmp/ethan-rookie-hugo-build.log"
fi

if node scripts/check_site_links.mjs "${VERIFY_DIR}" / >/tmp/ethan-rookie-link-check.log 2>&1; then
  pass "Generated site links resolve."
else
  fail "Generated site link check failed. See /tmp/ethan-rookie-link-check.log"
fi

if [ "${FAILED}" -eq 0 ]; then
  info "Ready to push: git push -u origin main"
else
  info "Not ready yet. Fix the [FAIL] items above, then rerun this script."
fi

exit "${FAILED}"

