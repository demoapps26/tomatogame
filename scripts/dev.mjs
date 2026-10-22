import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { buildGame, root } from "./build.mjs";
await buildGame();
let timer,
  building = false,
  queued = false;
async function rebuild() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  try {
    await buildGame();
    console.log("Rebuilt. Refresh the browser.");
  } catch (error) {
    console.error(error.message);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  }
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 180);
}
watch(path.join(root, "src"), { recursive: true }, schedule);
for (const file of ["style.css"]) watch(path.join(root, file), schedule);
const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!["/", "/index.html", "/TomatoRepublic.html"].includes(pathname)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const html = await readFile(path.join(root, "dist/index.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : html);
  } catch {
    res.writeHead(503);
    res.end("Build unavailable");
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
  process.exit();
});
server.listen(Number(process.env.PORT || 8000), "0.0.0.0", () =>
  console.log(
    "Tomato Republic development server listening on port " +
      (process.env.PORT || 8000),
  ),
);
