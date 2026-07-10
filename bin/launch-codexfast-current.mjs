#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const plistBuddy = "/usr/libexec/PlistBuddy";

function appLooksLikeCodex(bundlePath) {
  const plistPath = path.join(bundlePath, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return false;
  const result = spawnSync(plistBuddy, ["-c", "Print :CFBundleIdentifier", plistPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim() === "com.openai.codex";
}

function resolveAppBundle() {
  if (process.env.CODEXFAST_APP_BUNDLE) return process.env.CODEXFAST_APP_BUNDLE;
  if (appLooksLikeCodex("/Applications/Codex.app")) return "/Applications/Codex.app";
  if (appLooksLikeCodex("/Applications/ChatGPT.app")) return "/Applications/ChatGPT.app";
  return "/Applications/Codex.app";
}

const appBundle = resolveAppBundle();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout ?? "";
}

function readPlist(key) {
  return run(plistBuddy, ["-c", `Print :${key}`, path.join(appBundle, "Contents", "Info.plist")]).trim();
}

function appVersionInfo() {
  const version = readPlist("CFBundleShortVersionString");
  const build = readPlist("CFBundleVersion");
  const executable = readPlist("CFBundleExecutable");
  return {
    version,
    build,
    executable,
    versionKey: `${version}+${build}`,
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseProcessLine(line) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;
  return {
    pid: Number.parseInt(match[1], 10),
    ppid: Number.parseInt(match[2], 10),
    state: match[3],
    command: match[4],
    line: line.trim(),
  };
}

function mainCodexExecutablePath() {
  try {
    return path.join(appBundle, "Contents", "MacOS", readPlist("CFBundleExecutable"));
  } catch {
    return path.join(appBundle, "Contents", "MacOS", "Codex");
  }
}

function isMainCodexProcess(processInfo) {
  const executable = mainCodexExecutablePath();
  return processInfo.command === executable || processInfo.command.startsWith(`${executable} `);
}

function classifyCodexProcesses(processes) {
  const appProcesses = processes.filter((processInfo) => processInfo.command.includes(`${appBundle}/Contents/`));
  return {
    all: appProcesses,
    main: appProcesses.filter(isMainCodexProcess),
    support: appProcesses.filter((processInfo) => !isMainCodexProcess(processInfo)),
  };
}

function readCodexProcesses() {
  const ps = spawnSync("ps", ["ax", "-o", "pid=", "-o", "ppid=", "-o", "state=", "-o", "command="], { encoding: "utf8" });
  if (ps.status !== 0) return classifyCodexProcesses([]);
  return classifyCodexProcesses(
    (ps.stdout ?? "")
    .split("\n")
      .map(parseProcessLine)
      .filter(Boolean),
  );
}

function printProcessList(title, processes) {
  if (processes.length === 0) return;
  console.log(title);
  for (const processInfo of processes.slice(0, 12)) console.log(`  ${processInfo.line}`);
  if (processes.length > 12) console.log(`  ... ${processes.length - 12} more`);
}

function printStatus() {
  const info = appVersionInfo();
  const processes = readCodexProcesses();
  console.log(`App bundle: ${appBundle}`);
  console.log(`App executable: ${info.executable}`);
  console.log(`Version key: ${info.versionKey}`);
  console.log(`Codex.app main running: ${processes.main.length > 0 ? "yes" : "no"}`);
  console.log(`Codex support processes: ${processes.support.length}`);
  console.log(`Codex.app running: ${processes.main.length > 0 ? "yes" : "no"}`);
  printProcessList("Running Codex main processes:", processes.main);
  printProcessList("Running Codex support processes:", processes.support);
}

function requestCodexQuit() {
  const result = spawnSync("osascript", ["-e", 'tell application id "com.openai.codex" to quit'], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  if (result.error?.code === "ETIMEDOUT") return false;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Could not ask Codex.app to quit${detail ? `:\n${detail}` : ""}`);
  }
  return true;
}

function terminateMainCodexProcesses() {
  for (const processInfo of readCodexProcesses().main) {
    try {
      process.kill(processInfo.pid, "SIGTERM");
    } catch {}
  }
}

function waitForMainCodexExit(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (readCodexProcesses().main.length === 0) return true;
    sleep(500);
  }
  return readCodexProcesses().main.length === 0;
}

function addVersionToObject(source, versionKey, description) {
  if (source.includes(`"${versionKey}"`)) return source;
  return source.replace(
    /const SUPPORTED_APP_VERSIONS = \{([\s\S]*?)\};\nconst context =/,
    (_match, body) =>
      `const SUPPORTED_APP_VERSIONS = {${body}, "${versionKey}": "${description}" };\nconst context =`,
  );
}

function addVersionToSet(source, setName, versionKey) {
  const setRegex = new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`);
  return source.replace(setRegex, (match, body) => {
    if (body.includes(`"${versionKey}"`)) return match;
    return `const ${setName} = new Set([${body}    "${versionKey}",\n]);`;
  });
}

function addUserDataDir(source, userDataDir) {
  if (!userDataDir) return source;
  if (source.includes(`--user-data-dir=${userDataDir}`)) return source;
  const escaped = userDataDir.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return source.replace(
    '        "--remote-debugging-address=127.0.0.1",\n    ],',
    `        "--remote-debugging-address=127.0.0.1",\n        "--user-data-dir=${escaped}",\n    ],`,
  );
}

function addExecutableName(source, executableName) {
  if (executableName === "Codex") return source;
  return source.replaceAll('"Contents", "MacOS", "Codex"', `"Contents", "MacOS", "${executableName}"`);
}

function escapeRegexLiteral(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function modelDisplayName(modelId) {
  return process.env.CODEXFAST_MODEL_DISPLAY_NAME ?? modelId.replace(/^gpt-/i, "GPT-");
}

function patcherSourceLiteralMatch(source) {
  return source.match(/const __PATCHER_SOURCE__ = ((?:"(?:[^"\\]|\\.)*"));/);
}

function replacePatcherSource(source, transform) {
  const match = patcherSourceLiteralMatch(source);
  if (!match) return source;
  const patcherSource = JSON.parse(match[1]);
  const nextPatcherSource = transform(patcherSource);
  if (nextPatcherSource === patcherSource) return source;
  return source.replace(match[0], `const __PATCHER_SOURCE__ = ${JSON.stringify(nextPatcherSource)};`);
}

function currentModelRuntimePatchSource(modelId, displayName) {
  return `
// codexfast-model-override-current-extension
const CODEXFAST_MODEL_OVERRIDE_SOURCE_ID = "gpt-5.5";
const CODEXFAST_MODEL_OVERRIDE_TARGET_ID = ${JSON.stringify(modelId)};
const CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME = ${JSON.stringify(displayName)};
const CODEXFAST_MODEL_OVERRIDE_SOURCE_LITERAL = JSON.stringify(CODEXFAST_MODEL_OVERRIDE_SOURCE_ID);
const CODEXFAST_MODEL_OVERRIDE_TARGET_LITERAL = JSON.stringify(CODEXFAST_MODEL_OVERRIDE_TARGET_ID);
const CODEXFAST_MODEL_OVERRIDE_DISPLAY_LITERAL = JSON.stringify(CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME);
const CURRENT_MODEL_LIST_SELECT_SIGNATURE = /select:\\(\\{data:([A-Za-z_$][\\w$]*)\\}\\)=>([A-Za-z_$][\\w$]*)\\(\\{authMethod:([A-Za-z_$][\\w$]*),availableModels:new Set\\(([A-Za-z_$][\\w$]*)\\),defaultModel:([A-Za-z_$][\\w$]*),enabledReasoningEfforts:([A-Za-z_$][\\w$]*),includeUltraReasoningEffort:([A-Za-z_$][\\w$]*),models:\\1,useHiddenModels:([A-Za-z_$][\\w$]*)\\}\\)/;
function codexfastCurrentModelListExpression(modelsVar) {
    return \`(()=>{let m=\${modelsVar};if(!Array.isArray(m))return m;let s=\${CODEXFAST_MODEL_OVERRIDE_SOURCE_LITERAL},t=\${CODEXFAST_MODEL_OVERRIDE_TARGET_LITERAL},d=\${CODEXFAST_MODEL_OVERRIDE_DISPLAY_LITERAL},h=m.some(e=>e?.model===t),o=[];for(let e of m){if(h&&e?.model===s)continue;let n=e?.model===s||e?.model===t?{...e,id:t,model:t,displayName:e.displayName&&e.model===t?e.displayName:d,hidden:!1,additionalSpeedTiers:Array.isArray(e.additionalSpeedTiers)?e.additionalSpeedTiers.includes(\\\`fast\\\`)?e.additionalSpeedTiers:[...e.additionalSpeedTiers,\\\`fast\\\`]:[\\\`fast\\\`],serviceTiers:Array.isArray(e.serviceTiers)&&e.serviceTiers.length>0?e.serviceTiers:[\${GPT_55_FAST_SERVICE_TIER}],defaultServiceTier:e.defaultServiceTier??null}:e;if(n?.model===t&&o.some(e=>e?.model===t))continue;o.push(n)}return o.some(e=>e?.model===t)?o:[...o,\${GPT_55_MODEL_ENTRY}]})()\`;
}
function codexfastPatchCurrentModelList(_match, modelsVar, selectorVar, authMethodVar, availableModelsVar, defaultModelVar, effortsVar, ultraVar, hiddenVar) {
    return \`select:({data:\${modelsVar}})=>\${selectorVar}({authMethod:\${authMethodVar},availableModels:new Set([...\${availableModelsVar},\${CODEXFAST_MODEL_OVERRIDE_TARGET_LITERAL}]),defaultModel:\${defaultModelVar}===\${CODEXFAST_MODEL_OVERRIDE_SOURCE_LITERAL}?\${CODEXFAST_MODEL_OVERRIDE_TARGET_LITERAL}:\${defaultModelVar},enabledReasoningEfforts:\${effortsVar},includeUltraReasoningEffort:\${ultraVar},models:/*codexfast-model-override-list*/\${codexfastCurrentModelListExpression(modelsVar)},useHiddenModels:\${hiddenVar}})\`;
}
function codexfastReplaceModelIdLiterals(content) {
    return content
        .replaceAll(\`\\\`\${CODEXFAST_MODEL_OVERRIDE_SOURCE_ID}\\\`\`, \`\\\`\${CODEXFAST_MODEL_OVERRIDE_TARGET_ID}\\\`\`)
        .replaceAll(CODEXFAST_MODEL_OVERRIDE_SOURCE_LITERAL, CODEXFAST_MODEL_OVERRIDE_TARGET_LITERAL)
        .replaceAll(\`'\${CODEXFAST_MODEL_OVERRIDE_SOURCE_ID}'\`, \`'\${CODEXFAST_MODEL_OVERRIDE_TARGET_ID}'\`);
}
const codexfastPreviousApplyRuntimePatchesToBody = applyRuntimePatchesToBody;
applyRuntimePatchesToBody = function(resourcePath, body) {
    const result = codexfastPreviousApplyRuntimePatchesToBody(resourcePath, body);
    let content = result.content;
    const matchedLabels = [...result.matchedLabels];
    const patchedLabels = [...result.patchedLabels];
    const alreadyPatchedLabels = [...result.alreadyPatchedLabels];
    const recordReplacement = (label, nextContent) => {
        if (nextContent === content) {
            return;
        }
        matchedLabels.push(label);
        patchedLabels.push(label);
        content = nextContent;
    };
    if (content.includes("codexfast-model-override-list")) {
        matchedLabels.push(\`\${CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME} model list current\`);
        alreadyPatchedLabels.push(\`\${CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME} model list current\`);
    } else {
        if (content.includes(CODEXFAST_MODEL_OVERRIDE_SOURCE_ID)) {
            recordReplacement(\`\${CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME} model id literals\`, codexfastReplaceModelIdLiterals(content));
        }
        recordReplacement(\`\${CODEXFAST_MODEL_OVERRIDE_TARGET_DISPLAY_NAME} model list current\`, content.replace(CURRENT_MODEL_LIST_SELECT_SIGNATURE, codexfastPatchCurrentModelList));
    }
    return { content, matchedLabels, patchedLabels, alreadyPatchedLabels };
};
`;
}

function addCurrentModelRuntimePatch(source) {
  const modelId = (process.env.CODEXFAST_MODEL_ID ?? "gpt-5.6").trim();
  if (!modelId || modelId === "gpt-5.5") return source;
  if (source.includes("codexfast-model-override-current-extension")) return source;
  const displayName = modelDisplayName(modelId);
  return replacePatcherSource(source, (patcherSource) => `${patcherSource}${currentModelRuntimePatchSource(modelId, displayName)}`);
}

function addModelOverride(source) {
  const modelId = (process.env.CODEXFAST_MODEL_ID ?? "gpt-5.6").trim();
  if (!modelId || modelId === "gpt-5.5") return source;
  return source
    .replaceAll("gpt-5\\.5", escapeRegexLiteral(modelId))
    .replaceAll("gpt-5.5", modelId)
    .replaceAll("GPT-5.5", modelDisplayName(modelId));
}

function addAppBundle(source) {
  if (appBundle === "/Applications/Codex.app") return source;
  return source.replaceAll('"/Applications/Codex.app"', JSON.stringify(appBundle));
}

function allowWrapperManagedRunningCheck(source) {
  return source.replace(
    '    if (process.env.CODEXFAST_TEST_CODEX_RUNNING === "1") {\n        return { ok: true, running: true };\n    }\n',
    '    if (process.env.CODEXFAST_WRAPPER_NO_MAIN_PROCESS === "1") {\n        return { ok: true, running: false };\n    }\n    if (process.env.CODEXFAST_TEST_CODEX_RUNNING === "1") {\n        return { ok: true, running: true };\n    }\n',
  );
}

function findBundledCodexfastTarball() {
  const vendorDir = path.join(scriptDir, "vendor");
  if (!fs.existsSync(vendorDir)) return null;
  const files = fs.readdirSync(vendorDir)
    .filter((file) => /^codexfast-\d+\.\d+\.\d+\.tgz$/.test(file))
    .sort();
  const latest = files.at(-1);
  return latest ? path.join(vendorDir, latest) : null;
}

function copyFallbackTarball(tempRoot, npmError) {
  const explicit = process.env.CODEXFAST_PACKAGE_TARBALL;
  const fallback = explicit || findBundledCodexfastTarball();
  if (!fallback || !fs.existsSync(fallback)) throw npmError;
  const destination = path.join(tempRoot, path.basename(fallback));
  fs.copyFileSync(fallback, destination);
  console.warn(`npm pack failed; using bundled codexfast tarball: ${fallback}`);
  return destination;
}

function prepareLauncher({ isolatedProfile = null } = {}) {
  const info = appVersionInfo();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codexfast-current-"));
  let tarball;
  const explicitTarball = process.env.CODEXFAST_PACKAGE_TARBALL;
  if (explicitTarball) {
    tarball = copyFallbackTarball(tempRoot, new Error(`CODEXFAST_PACKAGE_TARBALL not found: ${explicitTarball}`));
  } else {
    try {
      const packJson = run("npm", ["pack", "codexfast@latest", "--json", "--pack-destination", tempRoot]);
      const pack = JSON.parse(packJson)[0];
      tarball = path.join(tempRoot, pack.filename);
    } catch (error) {
      tarball = copyFallbackTarball(tempRoot, error);
    }
  }
  run("tar", ["-xzf", tarball, "-C", tempRoot]);

  const sourceLauncher = path.join(tempRoot, "package", "bin", "codexfast");
  const preparedLauncher = path.join(tempRoot, "codexfast-current");
  const packageJson = JSON.parse(fs.readFileSync(path.join(tempRoot, "package", "package.json"), "utf8"));
  const description = `${path.basename(appBundle)} ${info.version} build ${info.build} local runtime trial`;

  let source = fs.readFileSync(sourceLauncher, "utf8");
  source = addAppBundle(source);
  source = allowWrapperManagedRunningCheck(source);
  source = addVersionToObject(source, info.versionKey, description);
  source = addVersionToSet(source, "runtimePatchNoPluginsAccessRequiredVersionKeys", info.versionKey);
  source = addVersionToSet(source, "runtimePatchNoPluginTargetsVersionKeys", info.versionKey);
  source = addExecutableName(source, info.executable);
  source = addModelOverride(source);
  source = addCurrentModelRuntimePatch(source);
  source = addUserDataDir(source, isolatedProfile);

  fs.writeFileSync(preparedLauncher, source, "utf8");
  fs.chmodSync(preparedLauncher, 0o755);

  return {
    ...info,
    appBundle,
    codexfastVersion: packageJson.version,
    preparedLauncher,
    tempRoot,
  };
}

function runSelftests(preparedLauncher) {
  run(process.execPath, [preparedLauncher, "__selftest-cdp-frame"], { stdio: "inherit" });
  run(process.execPath, [preparedLauncher, "__selftest-runtime-patch-body"], { stdio: "inherit" });
}

function killProcessesUsingProfile(profile) {
  const ps = spawnSync("ps", ["ax", "-o", "pid=", "-o", "command="], { encoding: "utf8" });
  const pids = (ps.stdout ?? "")
    .split("\n")
    .filter((line) => line.includes(profile))
    .map((line) => Number.parseInt(line.trim().split(/\s+/, 1)[0], 10))
    .filter(Number.isFinite);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  if (pids.length > 0) {
    sleep(1000);
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

async function isolatedTest() {
  const profile = path.join(os.tmpdir(), "codexfast-current-profile");
  const codexHome = path.join(profile, "codex-home");
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(codexHome, { recursive: true });
  const prepared = prepareLauncher({ isolatedProfile: profile });
  runSelftests(prepared.preparedLauncher);

  console.log(`Prepared codexfast ${prepared.codexfastVersion} for ${prepared.versionKey}`);
  console.log(`Isolated profile: ${profile}`);

  const child = spawn(process.execPath, [prepared.preparedLauncher, "launch"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CODEXFAST_DEBUG_RUNTIME: process.env.CODEXFAST_DEBUG_RUNTIME ?? "0",
      CODEXFAST_WRAPPER_NO_MAIN_PROCESS: "1",
    },
  });

  let output = "";
  let settled = false;

  const finish = (code) => {
    if (settled) return;
    settled = true;
    killProcessesUsingProfile(profile);
    fs.rmSync(profile, { recursive: true, force: true });
    if (code !== 0) process.exitCode = code;
  };

  const onData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    output += text;
    if (output.includes("Runtime launch completed.")) {
      console.log("\nIsolated runtime patch test reached ready state; cleaning up test app.");
      child.kill("SIGINT");
      finish(0);
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => {
    if (!settled) finish(code ?? 1);
  });

  setTimeout(() => {
    if (!settled) {
      console.error("Timed out waiting for isolated runtime patch readiness.");
      child.kill("SIGINT");
      finish(1);
    }
  }, 70_000);
}

async function launchNormal() {
  if (readCodexProcesses().main.length > 0) {
    console.error("Codex.app is already running. Quit Codex.app first, or run this launcher with `relaunch` from Terminal.");
    process.exitCode = 1;
    return;
  }
  const prepared = prepareLauncher();
  runSelftests(prepared.preparedLauncher);
  console.log(`Prepared codexfast ${prepared.codexfastVersion} for ${prepared.versionKey}`);
  console.log("This launch does not modify Codex.app. Keep this terminal process running while using Codex.");
  const child = spawn(process.execPath, [prepared.preparedLauncher, "launch"], {
    stdio: "inherit",
    env: { ...process.env, CODEXFAST_WRAPPER_NO_MAIN_PROCESS: "1" },
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

async function relaunch({ dryRun = false } = {}) {
  printStatus();
  console.log("");
  if (dryRun) {
    console.log("Dry run:");
    console.log("Would request Codex.app to quit only if its main process is running.");
    console.log("Would wait for the main Codex process to exit.");
    console.log("Would start runtime patch launch.");
    return;
  }

  if (readCodexProcesses().main.length > 0) {
    console.log("Requesting Codex.app to quit...");
    if (!requestCodexQuit()) {
      console.log("AppleScript quit timed out; sending SIGTERM to the main Codex process.");
      terminateMainCodexProcesses();
    }
    if (!waitForMainCodexExit()) {
      console.error("Main Codex process did not exit within 20 seconds. Quit it manually with Command-Q, then run `launch` again.");
      process.exitCode = 1;
      return;
    }
    console.log("Codex.app exited.");
  } else if (readCodexProcesses().support.length > 0) {
    console.log("Only Codex support processes are still present; continuing with runtime patch launch.");
  }

  await launchNormal();
}

function selftestProcessClassification() {
  const originalAppBundle = appBundle;
  const originalExecutable = path.join(originalAppBundle, "Contents", "MacOS", appVersionInfo().executable);
  const bareOnly = classifyCodexProcesses([
    parseProcessLine(`2087 1 S ${originalAppBundle}/Contents/Resources/native/bare-modifier-monitor --key DoubleCommand --immediate`),
  ].filter(Boolean));
  if (bareOnly.main.length !== 0 || bareOnly.support.length !== 1) {
    throw new Error("bare-modifier-monitor should be classified as a support process only");
  }

  const withMain = classifyCodexProcesses([
    parseProcessLine(`2087 1 S ${originalAppBundle}/Contents/Resources/native/bare-modifier-monitor --key DoubleCommand --immediate`),
    parseProcessLine(`5916 1 S ${originalExecutable}`),
  ].filter(Boolean));
  if (withMain.main.length !== 1 || withMain.support.length !== 1) {
    throw new Error("main Codex executable should be classified as the main process");
  }

  console.log("Process classification self-test passed");
}

async function main() {
  const command = process.argv[2] ?? "launch";
  if (command === "__selftest-process-classification") {
    selftestProcessClassification();
    return;
  }
  if (command === "prepare") {
    const prepared = prepareLauncher();
    runSelftests(prepared.preparedLauncher);
    console.log(JSON.stringify(prepared, null, 2));
    return;
  }
  if (command === "isolated-test") {
    await isolatedTest();
    return;
  }
  if (command === "launch") {
    await launchNormal();
    return;
  }
  if (command === "status") {
    printStatus();
    return;
  }
  if (command === "relaunch") {
    await relaunch({ dryRun: process.argv.includes("--dry-run") });
    return;
  }
  console.error("Usage: launch-codexfast-current.mjs [launch|relaunch|status|isolated-test|prepare]");
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
