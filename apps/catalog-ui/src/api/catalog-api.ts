import type { ApplyProgress, ApplyResult } from "../types";

export const catalogApi = import.meta.env.VITE_CATALOG_API?.replace(/\/$/, "") ?? "";

export async function copyText(content: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const area = document.createElement("textarea");
  area.value = content;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("The browser did not allow copying to the clipboard");
}

export async function readApplyStream(
  response: Response,
  onProgress: (progress: ApplyProgress) => void,
): Promise<ApplyResult> {
  if (!response.ok || !response.body) {
    throw new Error("Skills Manager progress stream was unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ApplyResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: "progress" | "result" | "error";
        progress?: ApplyProgress;
        result?: ApplyResult;
        error?: string;
      };
      if (event.type === "progress" && event.progress) onProgress(event.progress);
      if (event.type === "result" && event.result) result = event.result;
      if (event.type === "error") throw new Error(event.error ?? "Skills Manager apply failed");
    }
    if (done) break;
  }
  if (!result) throw new Error("Skills Manager did not return an apply result");
  return result;
}
