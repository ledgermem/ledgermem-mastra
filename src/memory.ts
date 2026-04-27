import { LedgerMem } from "@ledgermem/memory";

export interface LedgerMemMemoryOptions {
  client?: LedgerMem;
  apiKey?: string;
  workspaceId?: string;
  /** Number of recent messages to keep verbatim in working memory. */
  workingWindow?: number;
  /** Default top-k for semantic recall. */
  recallLimit?: number;
}

export interface MemoryMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt?: string;
}

export interface MemoryThread {
  threadId: string;
  resourceId?: string;
  messages: MemoryMessage[];
}

export interface MemoryRecallOptions {
  threadId: string;
  resourceId?: string;
  query?: string;
  limit?: number;
}

interface RememberResult {
  threadId: string;
  resourceId?: string;
  recent: MemoryMessage[];
  semantic: Array<{ id: string; content: string; score?: number }>;
}

interface RememberMessageInput {
  threadId: string;
  resourceId?: string;
  message: MemoryMessage;
}

/**
 * Mastra-compatible memory provider backed by LedgerMem.
 *
 * Mastra agents call `remember()` before generation and `rememberMessage()`
 * after each turn. This class implements both: short-term recent messages
 * are kept in-process per thread; long-term semantic recall is delegated
 * to LedgerMem with `metadata.threadId` / `metadata.resourceId` filters.
 */
export class LedgerMemMemory {
  private readonly client: LedgerMem;
  private readonly workingWindow: number;
  private readonly recallLimit: number;
  private readonly threads = new Map<string, MemoryMessage[]>();

  constructor(options: LedgerMemMemoryOptions = {}) {
    this.client = resolveClient(options);
    this.workingWindow = options.workingWindow ?? 20;
    this.recallLimit = options.recallLimit ?? 5;
  }

  /**
   * Pull recent messages plus semantically-relevant memories for a turn.
   * Mastra calls this with the latest user query so semantic recall can
   * use it.
   */
  async remember(opts: MemoryRecallOptions): Promise<RememberResult> {
    const recent = this.getRecent(opts.threadId);
    const query = opts.query?.trim();
    const semantic = query
      ? await this.semanticRecall(query, opts)
      : [];
    return {
      threadId: opts.threadId,
      resourceId: opts.resourceId,
      recent,
      semantic,
    };
  }

  /**
   * Persist a message: always to the working buffer, and to LedgerMem
   * for user/assistant turns (system/tool turns are typically noise).
   */
  async rememberMessage(input: RememberMessageInput): Promise<void> {
    this.appendRecent(input.threadId, input.message);
    if (input.message.role !== "user" && input.message.role !== "assistant") {
      return;
    }
    await this.client.add(input.message.content, {
      metadata: {
        threadId: input.threadId,
        resourceId: input.resourceId ?? null,
        role: input.message.role,
        createdAt: input.message.createdAt ?? new Date().toISOString(),
      },
    });
  }

  /** Replace the working buffer for a thread (e.g. when loading from disk). */
  setThread(thread: MemoryThread): void {
    this.threads.set(
      thread.threadId,
      thread.messages.slice(-this.workingWindow),
    );
  }

  /** Clear all in-memory threads. Does not delete from LedgerMem. */
  reset(): void {
    this.threads.clear();
  }

  private getRecent(threadId: string): MemoryMessage[] {
    return this.threads.get(threadId) ?? [];
  }

  private appendRecent(threadId: string, msg: MemoryMessage): void {
    const buf = this.threads.get(threadId) ?? [];
    const next = [...buf, msg];
    if (next.length > this.workingWindow) {
      next.splice(0, next.length - this.workingWindow);
    }
    this.threads.set(threadId, next);
  }

  private async semanticRecall(
    query: string,
    opts: MemoryRecallOptions,
  ): Promise<Array<{ id: string; content: string; score?: number }>> {
    const limit = opts.limit ?? this.recallLimit;
    const raw = (await this.client.search(query, { limit })) as Array<
      Record<string, unknown>
    >;
    return raw.map((r) => ({
      id: String(r.id ?? ""),
      content: String(r.content ?? r.text ?? ""),
      score: typeof r.score === "number" ? r.score : undefined,
    }));
  }
}

function resolveClient(opts: LedgerMemMemoryOptions): LedgerMem {
  if (opts.client) return opts.client;
  const apiKey = opts.apiKey ?? process.env.LEDGERMEM_API_KEY;
  const workspaceId = opts.workspaceId ?? process.env.LEDGERMEM_WORKSPACE_ID;
  if (!apiKey || !workspaceId) {
    throw new Error(
      "LedgerMemMemory: missing apiKey/workspaceId. Pass them explicitly or set LEDGERMEM_API_KEY and LEDGERMEM_WORKSPACE_ID.",
    );
  }
  return new LedgerMem({ apiKey, workspaceId });
}
