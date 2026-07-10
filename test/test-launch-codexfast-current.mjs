#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const launcher = new URL("../bin/launch-codexfast-current.mjs", import.meta.url).pathname;
const scriptDir = path.dirname(launcher);
const bundledTarball = path.join(scriptDir, "vendor", "codexfast-0.48.0.tgz");

function run(args) {
  return spawnSync(process.execPath, [launcher, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...(fs.existsSync(bundledTarball) ? { CODEXFAST_PACKAGE_TARBALL: bundledTarball } : {}),
    },
    timeout: 30_000,
  });
}

function output(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

const status = run(["status"]);
assert.equal(status.status, 0, output(status));
assert.match(output(status), /Version key: \d+\.\d+\.\d+\+\d+/);
assert.match(output(status), /Codex\.app running:/);
assert.match(output(status), /Codex\.app main running:/);

const dryRun = run(["relaunch", "--dry-run"]);
assert.equal(dryRun.status, 0, output(dryRun));
assert.match(output(dryRun), /Dry run:/);
assert.match(output(dryRun), /Would request Codex\.app to quit only if its main process is running/);
assert.match(output(dryRun), /Would start runtime patch launch/);

const processClassification = run(["__selftest-process-classification"]);
assert.equal(processClassification.status, 0, output(processClassification));
assert.match(output(processClassification), /Process classification self-test passed/);

const prepared = run(["prepare"]);
assert.equal(prepared.status, 0, output(prepared));
const preparedLauncher = output(prepared).match(/"preparedLauncher": "([^"]+)"/)?.[1];
assert.ok(preparedLauncher, output(prepared));
const preparedSource = fs.readFileSync(preparedLauncher, "utf8");
assert.match(preparedSource, /gpt-5\.6/);
assert.match(preparedSource, /GPT-5\.6/);

const patcherSourceLiteral = preparedSource.match(/const __PATCHER_SOURCE__ = ((?:"(?:[^"\\]|\\.)*"));/)?.[1];
assert.ok(patcherSourceLiteral, "prepared launcher should embed runtime patcher source");
const patcherSource = eval(patcherSourceLiteral);
const applyRuntimePatchesToBody = new Function(`${patcherSource}\nreturn applyRuntimePatchesToBody;`)();
const currentModelListBody =
  "queryFn:()=>Ch(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:null,limit:a}),select:({data:r})=>Jv({authMethod:t,availableModels:new Set(e),defaultModel:n,enabledReasoningEfforts:c,includeUltraReasoningEffort:l,models:r,useHiddenModels:o})";
const modelListPatch = applyRuntimePatchesToBody("app://-/assets/app-main.js", currentModelListBody);
assert.notEqual(modelListPatch.content, currentModelListBody);
assert.match(modelListPatch.content, /codexfast-model-override-list/);
assert.match(modelListPatch.content, /gpt-5\.6/);
assert.ok(modelListPatch.patchedLabels.includes("GPT-5.6 model list current"));

console.log("launch-codexfast-current tests passed");
