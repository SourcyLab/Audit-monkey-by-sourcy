import { it, expect, vi } from "vitest";
import { defaultAISettings, provider } from "./ai";
import { newCase, sampleCase } from "./cases";
import { checklist } from "./checklist";
import { calculate, packet } from "./engine/review";
it("runs before-audit missing item guidance with no AI", () => {
  const c = newCase();
  expect(c.evidence.filter((x) => x.status === "missing")).toHaveLength(18);
  expect(checklist.every((x) => x[2] && x[3] && x[4])).toBe(true);
});
it("runs after-audit findings and dispute output with no AI", () => {
  const c = sampleCase();
  expect(calculate(c).final).toBe(6206);
  expect(packet(c, "Notice")).toContain("Standalone adjustment effect");
  expect(JSON.stringify(c)).not.toContain("apiKey");
});
it("never sends a request while disabled, even with a key", async () => {
  const request = vi.fn();
  await expect(
    provider.summarize(
      "data",
      { ...defaultAISettings(), key: "fictional-test-key" },
      request,
    ),
  ).rejects.toThrow("AI is off");
  expect(request).not.toHaveBeenCalled();
});
it.each(["openai-compatible", "anthropic"] as const)(
  "uses a caller key with %s only after opt-in",
  async (kind) => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            kind === "anthropic"
              ? { content: [{ type: "text", text: "Draft" }] }
              : { choices: [{ message: { content: "Draft" } }] },
          ),
        ),
      );
    expect(
      await provider.summarize(
        "redacted",
        {
          ...defaultAISettings(),
          enabled: true,
          provider: kind,
          endpoint: kind === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions",
          model: "user-model",
          key: "fictional-test-key",
        },
        request,
      ),
    ).toBe("Draft");
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0];
    expect(url).toContain(kind === "anthropic" ? "api.anthropic.com/v1/messages" : "api.openai.com/v1/chat/completions");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("user-model");
    expect(body.messages.at(-1).content).toBe("redacted");
    expect(options.headers[kind === "anthropic" ? "x-api-key" : "Authorization"]).toBe(kind === "anthropic" ? "fictional-test-key" : "Bearer fictional-test-key");
    expect(options.body).not.toContain("fictional-test-key");
  },
);
it("handles provider failure without changing the local engine", async () => {
  const request = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
  await expect(
    provider.summarize(
      "data",
      {
        ...defaultAISettings(),
        enabled: true,
        model: "user-model",
        key: "fictional-test-key",
      },
      request,
    ),
  ).rejects.toThrow("HTTP 401");
  expect(calculate(sampleCase()).final).toBe(6206);
});
