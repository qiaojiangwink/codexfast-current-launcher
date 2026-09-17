#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../bin/launch-codexfast-current.mjs", import.meta.url));
const scriptDir = path.dirname(launcher);
const bundledTarball = path.join(scriptDir, "vendor", "codexfast-0.48.0.tgz");

function run(args, env = {}) {
  return spawnSync(process.execPath, [launcher, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEXFAST_MODEL_ID: "",
      CODEXFAST_MODEL_DISPLAY_NAME: "",
      ...(fs.existsSync(bundledTarball) ? { CODEXFAST_PACKAGE_TARBALL: bundledTarball } : {}),
      ...env,
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
assert.doesNotMatch(preparedSource, /codexfast-model-override-current-extension/);
assert.doesNotMatch(preparedSource, /codexfast-current-model-filter-bridge/);
assert.match(
  preparedSource,
  /function childEnvWithAutomaticUpdateSetting\(env = process\.env\) \{\n    \/\/ codexfast-current: remove an inherited codexfast hook/,
);
assert.doesNotMatch(preparedSource, /CODEXFAST_ORIGINAL_NODE_OPTIONS/);

const childEnvFunctionSource = preparedSource.match(
  /function childEnvWithAutomaticUpdateSetting\(env = process\.env\) \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(childEnvFunctionSource, "prepared launcher should contain the child environment helper");
const childEnvWithAutomaticUpdateSetting = new Function(
  `${childEnvFunctionSource}\nreturn childEnvWithAutomaticUpdateSetting;`,
)();
const cleanEnvironment = { NODE_OPTIONS: "--trace-warnings" };
assert.strictEqual(childEnvWithAutomaticUpdateSetting(cleanEnvironment), cleanEnvironment);
const inheritedHookEnvironment = {
  NODE_OPTIONS: '--trace-warnings --require="/Users/example/.codex/.tmp/codexfast/main-process-hook.cjs"',
};
assert.deepEqual(childEnvWithAutomaticUpdateSetting(inheritedHookEnvironment), {
  NODE_OPTIONS: "--trace-warnings",
});
assert.equal(
  childEnvWithAutomaticUpdateSetting({
    NODE_OPTIONS: '--require="/Users/example/.codex/.tmp/codexfast/main-process-hook.cjs"',
  }).NODE_OPTIONS,
  undefined,
);

const defaultPatcherSourceLiteral = preparedSource.match(/const __PATCHER_SOURCE__ = ((?:"(?:[^"\\]|\\.)*"));/)?.[1];
assert.ok(defaultPatcherSourceLiteral, "prepared launcher should embed runtime patcher source");
const defaultPatcherSource = eval(defaultPatcherSourceLiteral);
assert.doesNotMatch(defaultPatcherSource, /\.\.\.UPDATE_TARGET_SPECS/);
const applyDefaultRuntimePatchesToBody = new Function(`${defaultPatcherSource}\nreturn applyRuntimePatchesToBody;`)();
const automaticUpdateSettingsBody =
  "preventSleepWhileRunning:r({agentAccess:`read-write`,default:!1,description:`Whether the machine stays awake while Codex is running`,key:`preventSleepWhileRunning`,schema:t}),";
const automaticUpdateSettingsPatch = applyDefaultRuntimePatchesToBody(
  "app://-/assets/app-main.js",
  automaticUpdateSettingsBody,
);
assert.equal(automaticUpdateSettingsPatch.content, automaticUpdateSettingsBody);
assert.ok(!automaticUpdateSettingsPatch.patchedLabels.includes("Disable automatic updates schema"));

const modelOverridePrepared = run(["prepare"], {
  CODEXFAST_MODEL_ID: "gpt-5.6",
  CODEXFAST_MODEL_DISPLAY_NAME: "GPT-5.6",
});
assert.equal(modelOverridePrepared.status, 0, output(modelOverridePrepared));
const modelOverridePreparedLauncher = output(modelOverridePrepared).match(/"preparedLauncher": "([^"]+)"/)?.[1];
assert.ok(modelOverridePreparedLauncher, output(modelOverridePrepared));
const modelOverridePreparedSource = fs.readFileSync(modelOverridePreparedLauncher, "utf8");
assert.match(modelOverridePreparedSource, /codexfast-model-override-current-extension/);
assert.match(modelOverridePreparedSource, /codexfast-current-model-filter-bridge/);

const patcherSourceLiteral = modelOverridePreparedSource.match(/const __PATCHER_SOURCE__ = ((?:"(?:[^"\\]|\\.)*"));/)?.[1];
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

const currentModelListBodyWithAdditionalModels =
  "queryFn:()=>Ch(`list-models-for-host`,{hostId:r,includeHidden:!0,cursor:null,limit:a}),select:({data:r})=>Jv({additionalAvailableModels:new Set(e),authMethod:t,availableModels:n.availableModels,defaultModel:n.defaultModel,enabledReasoningEfforts:c,includeUltraReasoningEffort:l,isCustomModelProvider:i,models:r,useHiddenModels:n.useHiddenModels})";
const modelListPatchWithAdditionalModels = applyRuntimePatchesToBody(
  "app://-/assets/app-main.js",
  currentModelListBodyWithAdditionalModels,
);
assert.notEqual(modelListPatchWithAdditionalModels.content, currentModelListBodyWithAdditionalModels);
assert.match(modelListPatchWithAdditionalModels.content, /codexfast-model-override-list/);
assert.match(modelListPatchWithAdditionalModels.content, /additionalAvailableModels:new Set\(\[\.\.\.e,\"gpt-5\.6\"\]\)/);
assert.match(modelListPatchWithAdditionalModels.content, /availableModels:new Set\(\[\.\.\.n\.availableModels,\"gpt-5\.6\"\]\)/);
assert.match(modelListPatchWithAdditionalModels.content, /isCustomModelProvider:i/);
assert.ok(modelListPatchWithAdditionalModels.patchedLabels.includes("GPT-5.6 model list current"));

console.log("launch-codexfast-current tests passed");
