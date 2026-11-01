import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { request } from "node:http";
import { auditServer, httpServer } from "./server";
import { sampleCase } from "../app/src/cases";

describe("MCP protocol and audit tool contracts", () => {
  const server = auditServer(),
    client = new Client({ name: "audit-monkey-test", version: "1.0.0" });
  beforeAll(async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
  });
  afterAll(async () => {
    await client.close();
    await server.close();
  });
  it("initializes and discovers eight typed tools with safe annotations", async () => {
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(8);
    for (const t of tools.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });
  it("calls WC and GL through MCP with structured calculation results", async () => {
    const c = sampleCase();
    const wc = await client.callTool({
      name: "calculate_wc",
      arguments: { policy: c.policy, rows: c.wc },
    });
    expect(wc.isError).not.toBe(true);
    expect(wc.structuredContent).toMatchObject({
      result: { final: 6206, balance: 1706 },
    });
    const gl = await client.callTool({
      name: "calculate_gl",
      arguments: { policy: c.policy, rows: c.gl },
    });
    expect(gl.structuredContent).toMatchObject({ result: { final: 3600 } });
  });
  it("rejects invalid inputs rather than silently converting them", async () => {
    const r = await client.callTool({
      name: "calculate_wc",
      arguments: { policy: {}, rows: [] },
    });
    expect(r.isError).toBe(true);
  });
  it("returns checklist and source rules with disclaimers", async () => {
    const list = await client.callTool({
      name: "list_audit_checklist",
      arguments: {},
    });
    expect(list.structuredContent).toHaveProperty(
      "items",
      expect.arrayContaining([expect.objectContaining({ id: "policy" })]),
    );
    const fl = await client.callTool({
      name: "get_state_rules",
      arguments: { state: "FL" },
    });
    expect(fl.structuredContent).toHaveProperty("disclaimer");
  });
  it("searches and fetches public guides without arbitrary file access", async () => {
    const search = await client.callTool({
      name: "search",
      arguments: { query: "overtime" },
    });
    expect(search.isError).not.toBe(true);
    expect(JSON.stringify(search.content)).toContain("wc");
    const guide = await client.callTool({
      name: "fetch",
      arguments: { id: "prepare" },
    });
    expect(JSON.stringify(guide.content)).toContain("Before the audit");
    const bad = await client.callTool({
      name: "fetch",
      arguments: { id: "../../.env" },
    });
    expect(bad.isError).toBe(true);
  });
  it("publishes resources and a preparation prompt", async () => {
    const resources = await client.listResources();
    expect(resources.resources).toHaveLength(7);
    const guide = await client.readResource({
      uri: "audit-monkey://guides/wc",
    });
    expect(guide.contents[0]).toHaveProperty("text");
    const prompts = await client.listPrompts();
    expect(prompts.prompts[0].name).toBe("prepare_audit");
    const prompt = await client.getPrompt({
      name: "prepare_audit",
      arguments: { line: "gl" },
    });
    expect(JSON.stringify(prompt)).toContain("GL");
  });
  it("reviews supplied case data and returns a draft without submitting it", async () => {
    const c = sampleCase();
    const review = await client.callTool({
      name: "review_case",
      arguments: { auditCase: c },
    });
    expect(review.structuredContent).toHaveProperty("findings");
    const draft = await client.callTool({
      name: "draft_dispute_packet",
      arguments: { auditCase: c },
    });
    expect(draft.structuredContent).toHaveProperty(
      "draft",
      expect.stringContaining("Nothing has been submitted."),
    );
    expect(draft.structuredContent).toHaveProperty(
      "draft",
      expect.stringContaining("FICTIONAL EXAMPLE"),
    );
  });
});
describe("real MCP transports", () => {
  it("negotiates over an actual stdio subprocess with clean stdout", async () => {
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        fileURLToPath(new URL("./server.ts", import.meta.url)),
      ],
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(8);
      expect(
        (
          await client.callTool({
            name: "get_state_rules",
            arguments: { state: "FL" },
          })
        ).isError,
      ).not.toBe(true);
    } finally {
      await client.close();
    }
  }, 15000);
  it("negotiates local Streamable HTTP and blocks hostile origins and hosts", async () => {
    const http = httpServer();
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    const base = `http://127.0.0.1:${address.port}`,
      client = new Client({ name: "http-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(base + "/mcp")),
      );
      expect((await client.listTools()).tools).toHaveLength(8);
      expect(
        (await client.callTool({ name: "list_audit_checklist", arguments: {} }))
          .isError,
      ).not.toBe(true);
      expect(
        (
          await fetch(base + "/mcp", {
            method: "POST",
            headers: {
              Origin: "https://evil.example",
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
      ).toBe(403);
      const hostileHost = await new Promise<number>((resolve) => {
        const req = request(
          base + "/mcp",
          {
            method: "POST",
            headers: {
              Host: "evil.example",
              "Content-Type": "application/json",
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.end("{}");
      });
      expect(hostileHost).toBe(403);
      expect((await fetch(base + "/mcp")).status).toBe(405);
      expect((await fetch(base + "/elsewhere")).status).toBe(404);
      expect(
        (await fetch(base + "/mcp", { method: "POST", body: "{}" })).status,
      ).toBe(415);
    } finally {
      await client.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }, 15000);
});
