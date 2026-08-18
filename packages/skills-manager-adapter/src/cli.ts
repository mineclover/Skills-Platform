import * as fs from "node:fs/promises";
import * as path from "node:path";
import { applyActivationPlan, applyActivationPlanEvents, previewActivationPlan } from "./index";

export async function run(argv: string[]): Promise<any> {
  const [command, planPath, ...flags] = argv;
  if (!planPath || !["preview", "apply"].includes(command)) {
    throw new Error("Usage: skills-manager-adapter preview|apply <activation-plan.json> [--confirm] [--events]");
  }
  const plan = JSON.parse(await fs.readFile(path.resolve(planPath), "utf8"));
  if (command === "preview") return previewActivationPlan(plan);
  if (flags.includes("--events")) {
    const events = applyActivationPlanEvents(plan, { confirm: flags.includes("--confirm") });
    for await (const event of events) process.stdout.write(`${JSON.stringify(event)}\n`);
    return undefined;
  }
  return applyActivationPlan(plan, { confirm: flags.includes("--confirm") });
}
