# F04 — cost, latency, and why we don't stream

All numbers below are **measured** against z.ai's `glm-5.2` endpoint on 2026-08-19, not
estimated. Refresh them from the `[live] usage in=… cached=… out=…` line that
`npm run test:live` prints (add `--disableConsoleIntercept` to see it).

## Tokens per parse

`messages.countTokens` works on this endpoint and reports **4,412 input tokens** for the
canonical 6-item paste — that is the honest size of one request:

| Part                              | Tokens | Notes                                                     |
| --------------------------------- | -----: | --------------------------------------------------------- |
| System prompt                     | ~4,000 | 11,673 characters. Constant except the TODAY line.         |
| Tool schema (`record_expense`)    |   ~400 | 1,666 characters of JSON. Constant.                        |
| Wrapper + `<paste>` markers       |    ~30 | Constant.                                                  |
| The user's pasted text            | 40–350 | 5–15 lines is typical; the 8,000-char cap is ~2,300 worst. |
| **Input total, canonical fixture** | **4,412** | ~6,600 at the input cap.                            |
| Output (tool_use JSON, 6 items)   | 193–337 | ~35 tokens per item plus envelope. Varies run to run.     |

### z.ai caches the prompt by itself — this changes how to read `usage`

We send **no** `cache_control` (it is outside the portable surface §0.1 commits to), yet
every warm request comes back as:

```
usage: { input_tokens: 60, cache_read_input_tokens: 4352, output_tokens: 194 }
```

60 + 4,352 = 4,412 — exactly what `countTokens` reports. So `input_tokens` alone is the
**uncached remainder**, not the prompt size: reading it by itself understates the request
by ~70×. `ParseResult.usage` therefore reports `inputTokens` and `cachedInputTokens`
separately, and total input is the sum.

The cache is keyed on the prompt itself, which is directly observable: the first live run
after any edit to `prompt.ts` reports `input_tokens: 4412, cache_read_input_tokens: 0`, and
every run after it reports the split above. So a prompt edit costs one full-price request
and is then free again — worth knowing, and a cheap way to confirm a prompt change actually
reached the wire.

**Plan OQ-6 is closed: there is nothing to implement.** The caching we would have
experimented with is already happening, for free, without a field the endpoint might
reject. The prompt's length — which is exactly what keeps the 1000× money bug away — is
therefore not the cost lever it looked like. Do not trim the prompt to save tokens.

A repair round-trip roughly doubles input (the whole prompt is resent, plus the failed
`tool_use` and the error) and adds another ~200–350 output. Budget 2× for the p99.

Cost per parse = `4,400 × input_rate + 250 × output_rate`, most of the input at whatever
z.ai charges for a cache read. Fill in the published GLM-5.2 rates when they are to hand
(plan OQ-4) — at any plausible rate this is fractions of a rupiah per parse, and the
binding constraint is the abuse surface (roadmap D3 lets any Google account in), not unit
cost. See `app/api/parse/route.ts` for the four layers of defence and OQ-5 for the durable
fix.

## Latency

Measured, canonical fixture, from `messages.create` to a parsed response: **5.3 s**. A
full 15-test live corpus run takes 56–70 s wall clock, i.e. **~4–5 s per parse** including
the larger fixtures.

Hard-capped at 25 s (primary) + 15 s (repair) = 40 s, under `parseExpense`'s own 45 s
wall-clock deadline, inside the route's `maxDuration = 60`.

**The 25 s cap is real, and it fires.** Two of ~90 live calls during F04's development
exceeded it (`rp-prefixed` at 25.014 s, `single-line` earlier) and degraded to the regex
fallback exactly as designed. That is the p99 the fallback exists for; it is also why
`liveParse` in the live suite retries once on a fallback, so a transport hiccup does not
read as a prompt regression.

## Why we don't stream

1. **Nothing to render early.** The review table needs complete rows: a half-built
   `{"name": "roti bu` is not a row. Streaming would show a table that reflows on every
   token — worse UX than a clean skeleton.
2. **Validation is all-or-nothing.** Zod runs on the finished tool input. There is no
   partial-validation story, and partial JSON cannot be safely `JSON.parse`d.
3. **The repair loop needs the full response** to build the `tool_result` turn.
4. **Streaming complicates the fallback.** A stream that dies at token 40 leaves an
   ambiguous partial; a non-streaming call either returns or throws.
5. **Simplicity is the core tenet.** A non-streaming Route Handler is ~20 lines of
   control flow; a streaming one needs an SSE/`ReadableStream` bridge on both ends.

**Revisit if** p95 exceeds ~20 s. Then stream `content_block_delta` / `input_json_delta`
and progressively fill the table. That is an F05 concern and a strictly additive change —
`parseExpense`'s signature does not move.

## Model aliasing

We send `LLM_MODEL=glm-5.2`; the response echoes `"model": "glm-5.3"`. The endpoint
aliases upward. Nothing depends on the echoed value, but it means a future GLM release can
change parser behaviour without a change on our side — which is precisely what the live
corpus is for. Run `npm run test:live` after any unexplained parsing complaint.
