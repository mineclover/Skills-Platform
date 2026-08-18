import * as fs from "node:fs/promises";
import type { Stats } from "node:fs";
import * as path from "node:path";
import {
  digestDirectory,
  validateActivationPlan,
  type ActivationOperation,
  type ActivationPlan,
  type ActivationReport,
  type ValidationIssue,
} from "@skills-platform/contracts";

export interface PreviewOperation {
  operation: ActivationOperation;
  status: "create" | "replace" | "remove" | "noop" | "conflict" | "invalid";
  reason?: string;
  applied?: boolean;
}

export interface PreviewActivationPlanResult {
  valid: boolean;
  validation_issues: ValidationIssue[];
  operations: PreviewOperation[];
  summary: Record<string, number>;
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function registryRootFor(canonicalPath: string): string | null {
  const marker = `${path.sep}revisions${path.sep}`;
  const index = path.resolve(canonicalPath).indexOf(marker);
  return index < 0 ? null : path.resolve(canonicalPath).slice(0, index);
}

async function lstatOrNull(candidate: string): Promise<Stats | null> {
  try {
    return await fs.lstat(candidate);
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function inspectOperation(operation: ActivationOperation): Promise<PreviewOperation> {
  const canonicalPath = path.resolve(operation.canonical_path);
  const deliveryPath = path.resolve(operation.delivery_path);
  const canonicalStats = await lstatOrNull(canonicalPath);
  if (!canonicalStats?.isDirectory()) {
    return { operation, status: "invalid", reason: "canonical artifact directory is missing" };
  }
  if ((await digestDirectory(canonicalPath)) !== operation.content_digest) {
    return { operation, status: "invalid", reason: "canonical artifact digest does not match plan" };
  }

  const deliveryStats = await lstatOrNull(deliveryPath);
  if (!deliveryStats) {
    return { operation, status: operation.desired_state === "enabled" ? "create" : "noop" };
  }
  if (!deliveryStats.isSymbolicLink()) {
    return { operation, status: "conflict", reason: "delivery path is not a managed symbolic link" };
  }

  const actualTarget = await fs.realpath(deliveryPath);
  const sameTarget = path.resolve(actualTarget).toLowerCase() === canonicalPath.toLowerCase();
  const registryRoot = registryRootFor(canonicalPath);
  const managedTarget =
    registryRoot && isWithin(path.resolve(actualTarget), path.join(registryRoot, "revisions"));
  if (operation.desired_state === "enabled") {
    return sameTarget
      ? { operation, status: "noop" }
      : { operation, status: "replace", reason: "managed link targets a different pinned revision" };
  }
  if (sameTarget || managedTarget) return { operation, status: "remove" };
  return { operation, status: "conflict", reason: "delivery path links to an unmanaged target" };
}

export async function previewActivationPlan(plan: ActivationPlan): Promise<PreviewActivationPlanResult> {
  const validation = validateActivationPlan(plan);
  if (!validation.valid) {
    return { valid: false, validation_issues: validation.issues, operations: [], summary: {} };
  }
  const operations: PreviewOperation[] = [];
  for (const operation of plan.operations) {
    operations.push(await inspectOperation(operation));
  }
  const summary = operations.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  return {
    valid: !operations.some((item) => item.status === "invalid" || item.status === "conflict"),
    validation_issues: [],
    operations,
    summary,
  };
}

export async function materialize(previewOperation: PreviewOperation): Promise<PreviewOperation> {
  const { operation, status } = previewOperation;
  const deliveryPath = path.resolve(operation.delivery_path);
  if (status === "noop") return { ...previewOperation, applied: false };
  if (status === "remove" || status === "replace") {
    // Preview establishes this is a symbolic link to a managed registry target.
    await fs.rm(deliveryPath, { recursive: true, force: true });
  }
  if (status === "create" || status === "replace") {
    await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
    await fs.symlink(path.resolve(operation.canonical_path), deliveryPath, "junction");
  }
  return { ...previewOperation, applied: true };
}

export async function applyActivationPlan(
  plan: ActivationPlan,
  {
    confirm = false,
    onProgress = () => {},
  }: { confirm?: boolean; onProgress?: (progress: any) => void } = {},
): Promise<ActivationReport | null> {
  const events = applyActivationPlanEvents(plan, { confirm });
  let completedReport: ActivationReport | null = null;
  for await (const event of events) {
    if (event.type === "operation") {
      onProgress({
        processed_count: event.processed_count,
        total_count: event.total_count,
        operation: event.operation,
      });
    }
    if (event.type === "complete") completedReport = event.report;
  }
  return completedReport;
}

export async function* applyActivationPlanEvents(
  plan: ActivationPlan,
  { confirm = false }: { confirm?: boolean } = {},
): AsyncGenerator<any, ActivationReport, void> {
  if (!confirm) throw new Error("Explicit confirmation is required to materialize an activation plan");
  const preview = await previewActivationPlan(plan);
  yield { type: "preview", plan_id: plan.plan_id, preview };
  if (!preview.valid) {
    const error: any = new Error(
      "Activation plan cannot be applied because preview has invalid operations or conflicts",
    );
    error.preview = preview;
    throw error;
  }
  const completed: PreviewOperation[] = [];
  for (const [index, operation] of preview.operations.entries()) {
    const result = await materialize(operation);
    completed.push(result);
    yield {
      type: "operation",
      plan_id: plan.plan_id,
      processed_count: index + 1,
      total_count: preview.operations.length,
      operation: result,
    };
  }
  const report: ActivationReport = {
    plan_id: plan.plan_id,
    completed_at: new Date().toISOString(),
    status: "completed",
    operations: completed,
    summary: completed.reduce<Record<string, number>>((result, item) => {
      const key = item.applied ? "applied" : "skipped";
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {}),
  };
  yield { type: "complete", plan_id: plan.plan_id, report };
  return report;
}
