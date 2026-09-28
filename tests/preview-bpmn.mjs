import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, basename } from "node:path";
const output = resolve(process.argv[2] || "../bpmn-preview");
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["tests/bpmn-preview.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  outfile: `${output}/preview.js`,
  loader: {
    ".bpmn": "text",
    ".woff2": "file",
    ".woff": "file",
    ".ttf": "file",
    ".eot": "file",
    ".svg": "file",
  },
  define: { "process.env.NODE_ENV": '"development"' },
});
const assets = await readdir(".output/public/assets");
const css = assets.find((n) => n.startsWith("styles-") && n.endsWith(".css"));
await writeFile(`${output}/base.css`, await readFile(`.output/public/assets/${css}`));
await writeFile(
  `${output}/index.html`,
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BF Flow — verificação BPMN</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/preview.css"><body style="margin:0"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>',
);
createServer(async (req, res) => {
  const file = new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
  if (file !== basename(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
    );
    res.end(await readFile(`${output}/${file}`));
  } catch {
    res.writeHead(404).end();
  }
}).listen(4183, "127.0.0.1", () => console.log("BPMN local fixture: http://127.0.0.1:4183"));
