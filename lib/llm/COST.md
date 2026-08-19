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

The cache is keyed on the prompt and it expires, both directly observable. A run reports
`input_tokens: 4412, cache_read_input_tokens: 0` on the first request after any edit to
`prompt.ts`, and also after the endpoint has been idle a while (observed after roughly an
hour); every request after that reports the split above. So a prompt edit costs exactly one
full-price request and is then free again — which doubles as a cheap way to confirm a prompt
change actually reached the wire.

**Plan OQ-6 is closed: there is nothing to implement.** The caching we would have
experimented with is already happening, for free, without a field the endpoint might
reject. The prompt's length — which is exactly what keeps the 1000× money bug away — is
therefore not the cost lever it looked like. Do not trim the prompt to save tokens.

A repair round-trip roughly doubles input (the whole prompt is resent, plus the failed
`tool_use` and the error) and adds another ~200–350 output. Budget 2× for the p99.

## What a parse actually costs (OQ-4, closed)

z.ai's published direct-API rates for GLM-5.2, as of 2026-08-19 — **$1.40** per 1M input,
**$0.26** per 1M *cached* input, **$4.40** per 1M output. (Not OpenRouter's $0.50/$3.15;
we call `api.z.ai` directly.) Applied to the measured token counts above:

| Case                                       |     USD | ≈ IDR¹ | Notes                                     |
| ------------------------------------------ | ------: | -----: | ----------------------------------------- |
| Typical parse, warm prompt cache           | $0.0021 |  Rp 33 | 60 uncached + 4,352 cached in, 194 out    |
| First parse after any `prompt.ts` edit     | $0.0070 | Rp 113 | 4,412 uncached in — the cache-miss run    |
| Parse that needed the repair round-trip    | $0.0041 |  Rp 66 | ~2× input, ~2× output                     |
| **Worst legal single call** (8,000 chars, 50 items) | $0.0220 | Rp 351 | 2,300 uncached in + 4,000 out |
| 300 parses (≈10/day for a month)           |   $0.62 | Rp 9.900 | Ordinary personal use                   |

¹ At Rp 16.000/USD — an assumption, not a quoted rate.

So ordinary use is **fractions of a US cent per parse** and well under a dollar a month.
Unit cost is not the constraint. **The abuse surface is** (roadmap D3 lets any Google
account sign in):

> One signed-in account, saturating the burst limiter at 10 requests/minute for 24 hours,
> is 14,400 calls: **~$30/day** of typical parses, or **~$316/day** if every call is a
> maximum-size paste. Multiply by the number of warm serverless instances, because the
> limiter is per-instance (R-30).

That is the number OQ-5 needs a decision about before the domain is public. It is also why
the 8.000-char cap and `max_tokens: 4000` are not politeness — they are what turns an
unbounded bill into a bounded one. See `app/api/parse/route.ts` for all four layers.

Still unmeasured: z.ai's 429 body shape. No 429 was ever provoked, so whether the SDK
raises `Anthropic.RateLimitError` or a generic `APIError` here is untested — and
deliberately so: the way to find out is to hammer someone's paid endpoint. Its 401 body is
`{"error":{"message":"token expired or incorrect","type":"401"}}`, which the SDK does map
cleanly, and `parseExpense` treats every API throw identically anyway, so nothing in the
code branches on the distinction.

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
