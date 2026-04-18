import { join } from "node:path";
import indexPage from "./index.html";
import singlePage from "./single.html";

const turnJsAssetsRoot = join(import.meta.dir, "turnjs", "assets");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = Bun.serve({
  port,
  routes: {
    "/": indexPage,
    "/single": singlePage,
    "/assets/*": (request) => {
      const { pathname } = new URL(request.url);
      const assetPath = pathname.replace("/assets/", "");
      return new Response(Bun.file(join(turnJsAssetsRoot, assetPath)));
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(
  `flip-turn-js example running at http://${server.hostname}:${server.port}`
);
