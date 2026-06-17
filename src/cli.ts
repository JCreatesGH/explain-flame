#!/usr/bin/env node
import { parseExplain } from "./parse.js";
import { renderFlame } from "./flame.js";
import { explain } from "./analyze.js";

const HELP = `explain-flame — visualize & diagnose a Postgres EXPLAIN (ANALYZE, FORMAT JSON) plan

Usage:
  explain-flame [plan.json]            write an SVG flame graph to stdout
  explain-flame [plan.json] --summary  write a text diagnosis instead
  ... | explain-flame                  read the plan from stdin

Generate the input with:  EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...;`;

/** Pure core: turn a plan (JSON text) into SVG, or a text summary with --summary. */
export function run(args: string[], input: string): string {
  const root = parseExplain(input);
  return args.includes("--summary") ? explain(root) : renderFlame(root);
}

// Execute only as the CLI binary (not when imported by tests).
if (process.argv[1] && /cli\.js$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    process.exit(0);
  }
  const emit = (text: string) => {
    try {
      process.stdout.write(run(args, text) + "\n");
    } catch (e) {
      console.error(`error: ${(e as Error).message}`);
      process.exit(1);
    }
  };
  const file = args.find((a) => !a.startsWith("-"));
  if (file) {
    import("node:fs").then(({ readFileSync }) => emit(readFileSync(file, "utf8")));
  } else {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (input += d));
    process.stdin.on("end", () => emit(input));
  }
}
