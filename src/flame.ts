import { PlanNode } from "./parse.js";

const COLORS = ["#fee08b", "#fdae61", "#f46d43", "#d73027", "#a50026"];

function color(selfFrac: number): string {
  return COLORS[Math.min(COLORS.length - 1, Math.floor(selfFrac * COLORS.length))];
}

/** Render the plan as an SVG flame graph (width ∝ inclusive time). */
export function renderFlame(root: PlanNode, width = 800, rowHeight = 26): string {
  const total = root.totalMs || 1;
  const rects: string[] = [];

  function walk(node: PlanNode, x: number, depth: number): void {
    const w = (node.totalMs / total) * width;
    const y = depth * (rowHeight + 2);
    const selfFrac = node.totalMs ? node.selfMs / node.totalMs : 0;
    const label = `${node.type}${node.detail ? " · " + node.detail : ""}  (${node.selfMs}ms)`;
    rects.push(
      `<g><rect x="${r(x)}" y="${y}" width="${r(Math.max(w, 0.5))}" height="${rowHeight}" rx="2" ` +
      `fill="${color(selfFrac)}" stroke="#fff" stroke-width="0.5">` +
      `<title>${escape(label)} — total ${node.totalMs}ms, rows ${node.actualRows}` +
      `${node.loops > 1 ? `, ×${node.loops} loops` : ""}</title></rect>` +
      (w > 60 ? `<text x="${r(x + 4)}" y="${y + 17}" font-size="11" fill="#1a1a1a" ` +
        `font-family="monospace">${escape(clip(label, w))}</text>` : "") + `</g>`
    );
    let cx = x;
    for (const child of [...node.children].sort((a, b) => b.totalMs - a.totalMs)) {
      walk(child, cx, depth + 1);
      cx += (child.totalMs / total) * width;
    }
  }

  walk(root, 0, 0);
  const height = (depthOf(root) + 1) * (rowHeight + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
         `viewBox="0 0 ${width} ${height}">${rects.join("")}</svg>`;
}

function depthOf(n: PlanNode): number {
  return n.children.length ? 1 + Math.max(...n.children.map(depthOf)) : 0;
}
const r = (n: number) => Math.round(n * 100) / 100;
const clip = (s: string, w: number) => (s.length > w / 7 ? s.slice(0, Math.floor(w / 7) - 1) + "…" : s);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
