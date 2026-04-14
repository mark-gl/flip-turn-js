import { join } from "node:path";

const turnJsRoot = import.meta.dir;
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

async function serveFile(relativePath: string): Promise<Response> {
  const file = Bun.file(join(turnJsRoot, relativePath));

  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file);
}

const server = Bun.serve({
  port,
  routes: {
    "/": () => serveFile("index.html"),
    "/single": () => serveFile("single.html"),
    "/turn.js": () => serveFile("turn.js"),
    "/assets/*": (request) => {
      const { pathname } = new URL(request.url);
      return serveFile(pathname.slice(1));
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(
  `turn.js example running at http://${server.hostname}:${server.port}`
);
