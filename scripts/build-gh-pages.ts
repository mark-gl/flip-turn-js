import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";

rmSync("docs", { recursive: true, force: true });
mkdirSync("docs/assets", { recursive: true });

const result = await Bun.build({
  entrypoints: ["./demo/demo.ts"],
  outdir: "./docs",
  target: "browser",
  minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "Build failed");

const html = await readFile("./demo/demo.html", "utf-8");
await writeFile(
  "./docs/index.html",
  html
    .replace("../src/flip-turn.css", "./flip-turn.css")
    .replace("./demo.ts", "./demo.js")
);

await copyFile("./demo/demo.css", "./docs/demo.css");
await copyFile("./src/flip-turn.css", "./docs/flip-turn.css");

for (const file of readdirSync("./demo/assets").filter((f) =>
  f.endsWith(".jpg")
)) {
  await copyFile(`./demo/assets/${file}`, `./docs/assets/${file}`);
}
