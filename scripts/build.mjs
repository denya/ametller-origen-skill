import fs from "node:fs/promises";
import { build } from "esbuild";

const app = await build({
  entryPoints: ["src/insights-app.js"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
});
const template = await fs.readFile("src/insights-app.html", "utf8");
const appScript = app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const appHtml = template.replace("<!-- APP_SCRIPT -->", `<script>${appScript}</script>`);

await build({
  entryPoints: ["src/server.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  loader: { ".md": "text" },
  banner: {
    js: "import { createRequire } from 'node:module'; import { fileURLToPath as bundleFileURLToPath } from 'node:url'; import { dirname as bundleDirname } from 'node:path'; const require = createRequire(import.meta.url); const __filename = bundleFileURLToPath(import.meta.url); const __dirname = bundleDirname(__filename);",
  },
  outfile: "dist/server.mjs",
  external: [
    "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
    "chromium-bidi/lib/cjs/cdp/CdpConnection",
  ],
  plugins: [{
    name: "embedded-insights-app",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^virtual:insights-app$/ }, () => ({
        path: "insights-app",
        namespace: "embedded-app",
      }));
      buildApi.onLoad({ filter: /.*/, namespace: "embedded-app" }, () => ({
        contents: `export default ${JSON.stringify(appHtml)};`,
        loader: "js",
      }));
    },
  }],
});
