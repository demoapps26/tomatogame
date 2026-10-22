import { build } from "esbuild";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let buildSequence = 0;
export async function buildGame() {
  const result = await build({
    entryPoints: [path.join(root, "src/app.js")],
    bundle: true,
    format: "iife",
    target: ["es2020"],
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "warning",
  });
  const [template, css, license, assetNotices] = await Promise.all([
    readFile(path.join(root, "src/shell.html"), "utf8"),
    readFile(path.join(root, "style.css"), "utf8"),
    readFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), "utf8"),
    readFile(path.join(root, "ATTRIBUTIONS.md"), "utf8"),
  ]);
  const js = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
  const html = (
    `<!-- Generated from src/shell.html and src/app.js. Three.js license:\n${license}\nPhotographic resource provenance:\n${assetNotices}\n-->\n` +
    template
      .replace(
        /<link[^>]*href=["']style\.css["'][^>]*>/,
        `<style>${css}</style>`,
      )
      .replace(/<script[^>]*src=["']game\.js["'][^>]*><\/script>/, "")
      .replace("</body>", () => `<script>${js}</script></body>`)
  )
    .replace(/[\t ]+$/gm, "")
    .replace(/^[\t ]+/gm, (indent) => indent.replace(/ +\t/g, "\t"));
  await mkdir(path.join(root, "dist"), { recursive: true });
  const buildId = `${process.pid}-${++buildSequence}`;
  for (const file of [
    "index.html",
    "dist/index.html",
    "dist/TomatoRepublic.html",
  ]) {
    const target = path.join(root, file);
    const temporary = `${target}.${buildId}.tmp`;
    await writeFile(temporary, html);
    await rename(temporary, target);
  }
  return html.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await buildGame();
  console.log(
    `Built dist/TomatoRepublic.html (${Math.round(bytes / 1024)} KB). Opens directly in a modern browser; no external requests.`,
  );
}
