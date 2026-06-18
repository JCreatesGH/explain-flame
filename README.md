# explain-flame

[![CI](https://github.com/JCreatesGH/explain-flame/actions/workflows/ci.yml/badge.svg)](https://github.com/JCreatesGH/explain-flame/actions)
[![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Paste a Postgres `EXPLAIN (ANALYZE, FORMAT JSON)` plan and get a **flame graph** — width by time, color by *exclusive* (self) time — that points straight at the node to optimize and the row-estimate misses that cause bad plans.

![screenshot](assets/screenshot.png)

## Install

```bash
npm install explain-flame
```

## Use it

```ts
import { parseExplain, renderFlame, explain, slowestNode, rowEstimateMisses } from "explain-flame";

const plan = parseExplain(explainJson);          // string or parsed JSON

slowestNode(plan).type;                          // "Seq Scan"  ← burns the most self-time
rowEstimateMisses(plan);                         // nodes where actual rows >> planner estimate
fs.writeFileSync("plan.svg", renderFlame(plan)); // an SVG flame graph

console.log(explain(plan));                       // a plain-text diagnosis:
// Total time: 120 ms
// Slowest node: Seq Scan · orders — 90 ms self (75.0%)
//
// Suggestions:
//   • Seq Scan on orders burns 75.0% of run time — add an index or a more selective filter.
//   • Planner under-estimates rows on Seq Scan (orders): planned 100, got 5000 — run ANALYZE / check statistics.
```

## CLI

Installing the package adds an `explain-flame` command:

```bash
$ psql -XAtc 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT …' | explain-flame > plan.svg
$ explain-flame plan.json --summary        # text diagnosis instead of SVG
```

Generate the input with:

```sql
EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...;
```

## What it diagnoses

- **Self-time, not just totals** — Postgres reports cumulative `Actual Total Time`; this computes each node's *exclusive* time (and multiplies by `Actual Loops`), so the flame graph colors the node actually doing the work, not its parent.
- **Bad-stats finder** — flags nodes where actual rows diverge from the estimate by 10×+, the usual root cause of a bad plan.
- **Disk spills** — a sort/hash with `Sort Method: external` / `Sort Space Type: Disk` → "raise `work_mem`" (with the spilled size).
- **Nested-loop blowups** — a node executed hundreds/thousands of times (a Nested Loop inner side) that also costs real time → "use a hash/merge join or an index on the join key".
- **Low filter selectivity** — a scan that reads many rows and throws most away (`Rows Removed by Filter` ≫ kept) → "index so the filter runs earlier".
- **Just an SVG** — no server, no canvas; the output has `<title>` tooltips per node (now including loop counts) and embeds anywhere.

## Development

```bash
npm install && npm test    # 15 tests
npm run build              # tsc, clean
```

## License

MIT
