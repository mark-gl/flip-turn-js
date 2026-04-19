import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";

rmSync("docs", { recursive: true, force: true });
mkdirSync("docs/assets", { recursive: true });

await Bun.$`${process.execPath} x typedoc --options ./typedoc.json`;

const result = await Bun.build({
  entrypoints: ["./demo/demo.ts"],
  outdir: "./docs",
  target: "browser",
  minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "Build failed");

await copyFile("./demo/gh-pages.html", "./docs/index.html");

await copyFile("./demo/demo.css", "./docs/demo.css");
await copyFile("./src/flip-turn.css", "./docs/flip-turn.css");

for (const file of readdirSync("./demo/assets").filter((f) =>
  f.endsWith(".jpg")
)) {
  await copyFile(`./demo/assets/${file}`, `./docs/assets/${file}`);
}
