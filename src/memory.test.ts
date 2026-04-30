import { describe, expect, it, vi, beforeEach } from "vitest";
import { MnemoMemory } from "./memory.js";

const search = vi.fn();
const add = vi.fn();

vi.mock("@mnemo/memory", () => ({
  Mnemo: vi.fn().mockImplementation(() => ({
    search,
    add,
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  })),
}));

describe("MnemoMemory", () => {
  beforeEach(() => {
    search.mockReset();
    add.mockReset();
    search.mockResolvedValue([
      { id: "m1", content: "user prefers TypeScript", score: 0.92 },
    ]);
    add.mockResolvedValue({ id: "new" });
  });

  it("recalls recent buffer + semantic results", async () => {
    const mem = new MnemoMemory({ apiKey: "k", workspaceId: "w" });
    await mem.rememberMessage({
      threadId: "t1",
      message: { role: "user", content: "hello" },
    });
    const out = await mem.remember({ threadId: "t1", query: "language" });
    expect(out.recent).toHaveLength(1);
    expect(out.semantic[0]).toEqual({
      id: "m1",
      content: "user prefers TypeScript",
      score: 0.92,
    });
  });

  it("only persists user/assistant messages to Mnemo", async () => {
    const mem = new MnemoMemory({ apiKey: "k", workspaceId: "w" });
    await mem.rememberMessage({
      threadId: "t1",
      message: { role: "system", content: "sys prompt" },
    });
    expect(add).not.toHaveBeenCalled();
    await mem.rememberMessage({
      threadId: "t1",
      message: { role: "assistant", content: "hi" },
    });
    expect(add).toHaveBeenCalledOnce();
  });

  it("trims working buffer to workingWindow", async () => {
    const mem = new MnemoMemory({
      apiKey: "k",
      workspaceId: "w",
      workingWindow: 2,
    });
    for (const c of ["a", "b", "c"]) {
      await mem.rememberMessage({
        threadId: "t1",
        message: { role: "user", content: c },
      });
    }
    const out = await mem.remember({ threadId: "t1" });
    expect(out.recent.map((m) => m.content)).toEqual(["b", "c"]);
  });

  it("skips semantic recall when no query is provided", async () => {
    const mem = new MnemoMemory({ apiKey: "k", workspaceId: "w" });
    const out = await mem.remember({ threadId: "t1" });
    expect(out.semantic).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
