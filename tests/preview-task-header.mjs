import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
const output = resolve(process.argv[2] || "../task-header-preview");
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["tests/task-header-preview.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  outfile: `${output}/preview.js`,
  define: { "process.env.NODE_ENV": '"development"' },
});
const assets = await readdir(".output/public/assets");
const css = assets.find((name) => name.startsWith("styles-") && name.endsWith(".css"));
await writeFile(
  `${output}/preview.css`,
  [
    await readFile(`.output/public/assets/${css}`, "utf8"),
    await readFile("src/components/user-tasks.css", "utf8"),
    await readFile("src/components/user-tasks-approved.css", "utf8"),
  ].join("\n"),
);
await writeFile(
  `${output}/index.html`,
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BF Flow — verificação local</title><link rel="stylesheet" href="/preview.css"><body style="font-family:var(--font-sans);background:var(--background)"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>',
);
await writeFile(
  `${output}/narrow.html`,
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>BF Flow — 390px</title><body><iframe title="Prévia móvel" src="/index.html" style="width:390px;height:740px;border:1px solid #ccc"></iframe></body></html>',
);
createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = path === "/" ? "index.html" : path.slice(1);
  if (!["index.html", "narrow.html", "preview.js", "preview.css"].includes(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
  );
  res.end(await readFile(`${output}/${file}`));
}).listen(4182, "127.0.0.1", () => console.log("Local component fixture: http://127.0.0.1:4182"));
