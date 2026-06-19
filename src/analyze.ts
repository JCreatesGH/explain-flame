import { PlanNode } from "./parse.js";

export function flatten(node: PlanNode): PlanNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** The node burning the most *exclusive* time — your optimization target. */
export function slowestNode(root: PlanNode): PlanNode {
  return flatten(root).reduce((a, b) => (b.selfMs > a.selfMs ? b : a));
}

/** Nodes where actual rows blew past the planner's estimate (bad stats). */
export function rowEstimateMisses(root: PlanNode, factor = 10): PlanNode[] {
  return flatten(root).filter((n) => {
    const est = Math.max(1, n.planRows);
    return n.actualRows > est * factor || est > Math.max(1, n.actualRows) * factor;
  });
}

/** Sort/hash nodes that spilled to disk (work_mem too low). */
export function diskSpills(root: PlanNode): PlanNode[] {
  return flatten(root).filter(
    (n) => n.sortSpaceType === "Disk" || /external/i.test(n.sortMethod ?? ""));
}

export function totalTime(root: PlanNode): number {
  return root.totalMs;
}

export interface Diagnosis {
  totalMs: number;
  slowest: { node: PlanNode; pctOfTotal: number };
  rowMisses: PlanNode[];
  suggestions: string[];
}

const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

/** Structured diagnosis: the hot node, row-estimate misses, and tuning suggestions. */
export function diagnose(root: PlanNode): Diagnosis {
  const total = root.totalMs || 1;
  const slow = slowestNode(root);
  const misses = rowEstimateMisses(root);
  const suggestions: string[] = [];

  const where = (n: PlanNode) => (n.detail ? ` on ${n.detail}` : "");
  if (/seq scan/i.test(slow.type) && slow.selfMs / total >= 0.2) {
    suggestions.push(
      `${slow.type}${where(slow)} burns ${pct(slow.selfMs / total)} of run time — ` +
      `add an index or a more selective filter.`);
  }
  for (const m of misses) {
    const est = Math.max(1, m.planRows);
    const dir = m.actualRows > est ? "under-estimates" : "over-estimates";
    suggestions.push(
      `Planner ${dir} rows on ${m.type}${m.detail ? ` (${m.detail})` : ""}: ` +
      `planned ${m.planRows}, got ${m.actualRows} — run ANALYZE / check statistics.`);
  }
  // Sort/hash spilled to disk → work_mem too low.
  for (const n of diskSpills(root)) {
    const kb = n.sortSpaceKb ? ` (${n.sortSpaceKb} kB)` : "";
    suggestions.push(
      `${n.type}${where(n)} spilled to disk${kb} — raise work_mem so it can sort/hash in memory.`);
  }
  // A node executed many times (the inner side of a Nested Loop) that also costs real time.
  for (const n of flatten(root)) {
    if (n.loops >= 100 && n.totalMs >= 0.2 * total) {
      suggestions.push(
        `${n.type}${where(n)} ran ${n.loops}× for ${n.totalMs}ms total (Nested Loop inner side) — ` +
        `consider a hash/merge join or an index on the join key.`);
    }
  }
  // Read a lot of rows only to throw most away → filter (or index) earlier.
  for (const n of flatten(root)) {
    if (n.rowsRemovedByFilter >= 1000 && n.rowsRemovedByFilter >= 9 * Math.max(1, n.actualRows)) {
      suggestions.push(
        `${n.type}${where(n)} read ${n.actualRows + n.rowsRemovedByFilter} rows and filtered out ` +
        `${n.rowsRemovedByFilter} — add or extend an index so the filter runs earlier.`);
    }
  }
  // Index Only Scan doing many heap fetches → the visibility map is stale.
  for (const n of flatten(root)) {
    if (/index only scan/i.test(n.type) && n.heapFetches >= 1000 &&
        n.heapFetches >= 0.5 * Math.max(1, n.actualRows)) {
      suggestions.push(
        `${n.type}${where(n)} did ${n.heapFetches} heap fetches — the visibility map is stale; ` +
        `VACUUM the table so the index-only scan can skip the heap.`);
    }
  }
  // Bitmap Heap Scan with lossy blocks → the bitmap didn't fit in work_mem.
  for (const n of flatten(root)) {
    if (n.lossyHeapBlocks > 0) {
      suggestions.push(
        `${n.type}${where(n)} used ${n.lossyHeapBlocks} lossy heap blocks — the bitmap exceeded ` +
        `work_mem and rechecks every row on those pages; raise work_mem.`);
    }
  }

  return {
    totalMs: root.totalMs,
    slowest: { node: slow, pctOfTotal: slow.selfMs / total },
    rowMisses: misses,
    suggestions,
  };
}

/** Human-readable diagnosis of a plan (the "explain" half of explain-flame). */
export function explain(root: PlanNode): string {
  const d = diagnose(root);
  const s = d.slowest.node;
  const lines = [
    `Total time: ${d.totalMs} ms`,
    `Slowest node: ${s.type}${s.detail ? ` · ${s.detail}` : ""} — ${s.selfMs} ms self (${pct(d.slowest.pctOfTotal)})`,
  ];
  if (d.rowMisses.length) lines.push(`Row-estimate misses: ${d.rowMisses.length}`);
  if (d.suggestions.length) {
    lines.push("", "Suggestions:");
    for (const sug of d.suggestions) lines.push(`  • ${sug}`);
  } else {
    lines.push("", "No obvious problems found.");
  }
  return lines.join("\n");
}
