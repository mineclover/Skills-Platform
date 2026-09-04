import type { AdapterActivationReport } from "./index";

export interface WritableOutput {
  write(content: string): unknown;
}

export interface RunOptions {
  onReport?: (report: AdapterActivationReport | null) => void;
  stdout?: WritableOutput;
}

export type CommandRunner = (argv: string[], options?: RunOptions) => Promise<unknown>;

export interface MainOptions {
  stdout?: WritableOutput;
  stderr?: WritableOutput;
  setExitCode?: (code: number) => void;
  execute?: CommandRunner;
}

interface RuntimeCli {
  run: CommandRunner;
  main(argv: string[], options?: MainOptions): Promise<unknown>;
}

// The executable and the emitted TypeScript entry point share one runtime
// implementation so failed-report exit semantics cannot drift.
const runtime = require("../src/cli.js") as RuntimeCli;

export const run = runtime.run;
export const main = runtime.main;
