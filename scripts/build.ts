import { mkdirSync, rmSync } from "node:fs";
import { copyFile } from "node:fs/promises";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const [naming, format, target] of [
  ["[name].js", "esm", "browser"],
  ["[name].cjs", "cjs", "node"],
] as const) {
  const result = await Bun.build({
    entrypoints: ["./src/flip-turn.ts"],
    outdir: "./dist",
    naming,
    format,
    target,
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, "Build failed");
}

await Bun.$`bunx esbuild ./src/flip-turn.ts --bundle --format=iife --global-name=FlipTurn --outfile=./dist/flip-turn.iife.js --minify --platform=browser --target=es2020`;
await Bun.$`bunx dts-bundle-generator -o ./dist/flip-turn.d.ts --project ./tsconfig.types.json ./src/flip-turn.ts`;
await copyFile("./src/flip-turn.css", "./dist/flip-turn.css");
