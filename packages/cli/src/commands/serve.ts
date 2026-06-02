import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath)] || "application/octet-stream";
}

export async function serveCommand(repoPath: string, options: { port?: string }): Promise<void> {
  const siteDir = join(repoPath, ".codewiki", "site");
  if (!existsSync(siteDir)) {
    console.error(`Error: No site directory found at ${siteDir}. Run 'codewiki scan ${repoPath}' first.`);
    process.exit(1);
  }

  const port = parseInt(options.port || "3000", 10);

  const server = createServer((req, res) => {
    const resolvedSiteDir = resolve(siteDir);
    let filePath = resolve(join(siteDir, req.url === "/" ? "index.html" : req.url || "index.html"));

    if (!filePath.startsWith(resolvedSiteDir)) {
      // Path traversal attempt — fall back to SPA
      filePath = join(siteDir, "index.html");
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      // SPA fallback
      filePath = join(siteDir, "index.html");
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": getMimeType(filePath) });
      res.end(content);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal error");
    }
  });

  server.listen(port, () => {
    console.log(`Serving ${siteDir} at http://localhost:${port}`);
  });

  // Keep process alive
  await new Promise(() => {});
}
