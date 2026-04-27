# @ledgermem/mastra

LedgerMem-backed memory provider for [Mastra](https://mastra.ai) agents.
Combines a per-thread short-term buffer with semantic long-term recall.

## Install

```bash
npm install @ledgermem/mastra @ledgermem/memory @mastra/core
```

Set `LEDGERMEM_API_KEY` and `LEDGERMEM_WORKSPACE_ID`, or pass them in.

## Quickstart (30 seconds)

```ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { LedgerMemMemory } from "@ledgermem/mastra";

const memory = new LedgerMemMemory({ workingWindow: 20, recallLimit: 5 });

const agent = new Agent({
  name: "support",
  instructions: "Use long-term memory to personalize responses.",
  model: openai("gpt-4o"),
  memory,
});

await agent.generate("Remember that I prefer concise answers.", {
  threadId: "user-42",
  resourceId: "user-42",
});
```

## What you get

- `remember({ threadId, query })` — recent messages + top-k semantic hits
- `rememberMessage({ threadId, message })` — appends to working buffer and
  persists user/assistant turns to LedgerMem
- Per-thread metadata (`threadId`, `resourceId`, `role`, `createdAt`) stored
  alongside each memory for filtering and audit

## License

MIT
