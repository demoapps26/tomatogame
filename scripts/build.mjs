import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
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
  const [template, css, license] = await Promise.all([
    readFile(path.join(root, "src/shell.html"), "utf8"),
    readFile(path.join(root, "style.css"), "utf8"),
    readFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), "utf8"),
  ]);
  const js = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
  const html = (
    `<!-- Generated from src/shell.html and src/app.js. Three.js license:\n${license}\n-->\n` +
    template
      .replace(
        /<link[^>]*href=["']style\.css["'][^>]*>/,
        `<style>${css}</style>`,
      )
      .replace(/<script[^>]*src=["']game\.js["'][^>]*><\/script>/, "")
      .replace("</body>", () => `<script>${js}</script></body>`)
  ).replace(/[\t ]+$/gm, "");
  await mkdir(path.join(root, "dist"), { recursive: true });
  await writeFile(path.join(root, "index.html"), html);
  await writeFile(path.join(root, "dist/index.html"), html);
  await writeFile(path.join(root, "dist/TomatoRepublic.html"), html);
  return html.length;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await buildGame();
  console.log(
    `Built dist/TomatoRepublic.html (${Math.round(bytes / 1024)} KB). Opens directly in a modern browser; no external requests.`,
  );
}
