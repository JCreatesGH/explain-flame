// Parse Postgres `EXPLAIN (ANALYZE, FORMAT JSON)` output into a node tree
// with computed self-time (exclusive time) per node.
export interface PlanNode {
  type: string;
  detail: string;          // relation / index / join keys summary
  totalMs: number;         // inclusive time (× loops)
  selfMs: number;          // exclusive time
  planRows: number;
  actualRows: number;
  children: PlanNode[];
}

interface RawPlan {
  "Node Type": string;
  "Actual Total Time"?: number;
  "Actual Loops"?: number;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Actual Rows"?: number;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Hash Cond"?: string;
  "Plans"?: RawPlan[];
}

function detailOf(p: RawPlan): string {
  if (p["Relation Name"] && p["Index Name"]) return `${p["Index Name"]} on ${p["Relation Name"]}`;
  return p["Index Name"] || p["Relation Name"] || p["Hash Cond"] || "";
}

function convert(p: RawPlan): PlanNode {
  const loops = p["Actual Loops"] ?? 1;
  const total = (p["Actual Total Time"] ?? 0) * loops;
  const children = (p["Plans"] ?? []).map(convert);
  const childTotal = children.reduce((s, c) => s + c.totalMs, 0);
  return {
    type: p["Node Type"],
    detail: detailOf(p),
    totalMs: round(total),
    selfMs: round(Math.max(0, total - childTotal)),
    planRows: p["Plan Rows"] ?? 0,
    actualRows: p["Actual Rows"] ?? 0,
    children,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function parseExplain(input: string | object): PlanNode {
  const json = typeof input === "string" ? JSON.parse(input) : input;
  const root = Array.isArray(json) ? json[0] : json;
  const plan: RawPlan = root.Plan ?? root;
  return convert(plan);
}
