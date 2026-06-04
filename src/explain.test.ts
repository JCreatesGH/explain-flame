import { describe, it, expect } from "vitest";
import { parseExplain } from "./parse";
import { slowestNode, rowEstimateMisses, flatten } from "./analyze";
import { renderFlame } from "./flame";

// A small but realistic EXPLAIN (ANALYZE, FORMAT JSON)
const EXPLAIN = JSON.stringify([{
  "Plan": {
    "Node Type": "Hash Join", "Actual Total Time": 120, "Actual Loops": 1,
    "Plan Rows": 1000, "Actual Rows": 1200, "Hash Cond": "(o.user_id = u.id)",
    "Plans": [
      { "Node Type": "Seq Scan", "Relation Name": "orders", "Actual Total Time": 90,
        "Actual Loops": 1, "Plan Rows": 100, "Actual Rows": 5000 },
      { "Node Type": "Hash", "Actual Total Time": 20, "Actual Loops": 1,
        "Plans": [
          { "Node Type": "Index Scan", "Relation Name": "users", "Index Name": "users_pkey",
            "Actual Total Time": 15, "Actual Loops": 1, "Plan Rows": 500, "Actual Rows": 500 }
        ]}
    ]
  }
}]);

describe("parseExplain", () => {
  const root = parseExplain(EXPLAIN);

  it("builds a tree with inclusive and self time", () => {
    expect(root.type).toBe("Hash Join");
    expect(root.totalMs).toBe(120);
    // self = 120 - (90 seqscan + 20 hash) = 10
    expect(root.selfMs).toBe(10);
    expect(root.children).toHaveLength(2);
  });

  it("summarizes relation/index detail", () => {
    const idx = flatten(root).find((n) => n.type === "Index Scan")!;
    expect(idx.detail).toBe("users_pkey on users");
  });

  it("multiplies time by loops", () => {
    const looped = parseExplain({ Plan: { "Node Type": "Nested Loop",
      "Actual Total Time": 5, "Actual Loops": 10 } });
    expect(looped.totalMs).toBe(50);
  });
});

describe("analysis", () => {
  const root = parseExplain(EXPLAIN);
  it("finds the slowest node by self time", () => {
    expect(slowestNode(root).type).toBe("Seq Scan");   // 90ms exclusive
  });
  it("flags row-estimate misses", () => {
    const misses = rowEstimateMisses(root);
    // Seq Scan estimated 100, got 5000 -> 50x off
    expect(misses.some((n) => n.type === "Seq Scan")).toBe(true);
  });
});

describe("renderFlame", () => {
  it("produces a valid SVG with node labels", () => {
    const svg = renderFlame(parseExplain(EXPLAIN));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Hash Join");
    expect(svg).toContain("<title>");
  });
});
