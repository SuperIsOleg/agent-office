#!/bin/sh
set -e
cd "$(dirname "$0")/.."
npx -y esbuild@0.24.0 web/src/main.ts --bundle --format=iife --target=es2022 --minify --legal-comments=none --outfile=web/office.js --log-level=warning
npx -y esbuild@0.24.0 web/src/check.ts --bundle --format=iife --target=es2022 --minify --legal-comments=none --outfile=web/check.js --log-level=warning
