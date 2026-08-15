#!/usr/bin/env node

export {
  defaultRubric,
  recordEvalRun,
  runCli,
} from "../plugins/furry-image-studio/scripts/record_eval_run.mjs";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../plugins/furry-image-studio/scripts/record_eval_run.mjs";

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
