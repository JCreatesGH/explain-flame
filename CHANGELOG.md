# Changelog

All notable changes are documented here, following
[Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [0.2.0]

### Added
- The parser now captures `Actual Loops`, `Rows Removed by Filter`, and sort
  spill info (`Sort Method`, `Sort Space Type`, `Sort Space Used`) on each node.
- Three more diagnostics in `diagnose()` / `explain()`:
  - **Disk spills** — a sort/hash that spilled to disk → raise `work_mem` (with
    the spilled size). Exposed as `diskSpills(root)`.
  - **Nested-loop blowups** — a node run ≥100× that also costs ≥20% of total →
    suggest a hash/merge join or an index on the join key.
  - **Low filter selectivity** — a scan that reads many rows and filters most
    away → add/extend an index so the filter runs earlier.
- Flame-graph tooltips now show the loop count for repeated nodes.

## [0.1.0]

### Added
- Parse Postgres `EXPLAIN (ANALYZE, FORMAT JSON)` into a node tree with computed
  self-time, an SVG flame graph, slowest-node and row-estimate-miss analysis, a
  text diagnosis, and an `explain-flame` CLI.
