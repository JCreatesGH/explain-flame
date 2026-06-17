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
