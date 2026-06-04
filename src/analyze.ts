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
