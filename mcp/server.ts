import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage } from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { auditServer } from "./factory";
export { auditServer } from "./factory";
export function safeLocalRequest(req: IncomingMessage, port: number) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  return (
    hosts.has(req.headers.host ?? "") &&
    (!req.headers.origin || origins.has(req.headers.origin))
  );
}
export function httpServer(port = 4318) {
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!safeLocalRequest(req, req.socket.localPort ?? port)) {
      res.writeHead(403).end("Forbidden host or origin");
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      res.writeHead(415).end();
      return;
    }
    const server = auditServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.writeHead(413).end("Request too large");
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(400).end("Invalid MCP request");
      await server.close();
    }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--http")) {
    const server = httpServer();
    server.listen(4318, "127.0.0.1", () =>
      process.stderr.write(
        "Audit Monkey MCP: local test endpoint http://127.0.0.1:4318/mcp. Do not expose without a reviewed deployment.\n",
      ),
    );
    process.once("SIGINT", () => server.close());
    process.once("SIGTERM", () => server.close());
  } else {
    const server = auditServer();
    await server.connect(new StdioServerTransport());
    process.once("SIGINT", () => {
      void server.close();
    });
  }
}
