import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../bin/launch-codexfast-current.mjs", import.meta.url));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "codexfast-relaunch-test-"));

try {
  const app = path.join(fixture, "Test Codex.app");
  const tools = path.join(fixture, "bin");
  const packageBin = path.join(fixture, "package", "bin");
  const tarball = path.join(fixture, "local-codexfast.tgz");
  const eventsFile = path.join(fixture, "events");
  const stateFile = path.join(fixture, "app-state");
  const infoPlist = path.join(app, "Contents", "Info.plist");
  const newPlist = path.join(fixture, "updated-Info.plist");

  for (const dir of [path.dirname(infoPlist), tools, packageBin]) fs.mkdirSync(dir, { recursive: true });
  const plist = (build) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleShortVersionString</key><string>26.1111.71704</string>
<key>CFBundleVersion</key><string>${build}</string>
<key>CFBundleExecutable</key><string>Codex</string>
</dict></plist>`;
  fs.writeFileSync(newPlist, plist("29031"));
  fs.writeFileSync(path.join(fixture, "package", "package.json"), '{"version":"0.79.0"}');
  fs.writeFileSync(path.join(packageBin, "codexfast"), `
    const fs = require("node:fs");
    const action = process.argv[2];
    fs.appendFileSync(process.env.CODEXFAST_TEST_EVENTS, action + "\\n");
    if (action === process.env.CODEXFAST_TEST_FAILED_ACTION) process.exitCode = 1;
  `);
  const archive = spawnSync("/usr/bin/tar", ["-czf", tarball, "-C", fixture, "package"], { encoding: "utf8" });
  assert.equal(archive.status, 0, archive.stderr);
  const invalidArchive = path.join(fixture, "invalid.tgz");
  fs.writeFileSync(invalidArchive, "This is not a tarball.");

  // Stub process discovery and AppleScript so the tests cannot quit the real app.
  fs.writeFileSync(path.join(tools, "ps"), `#!/bin/sh
if [ "$(cat "$CODEXFAST_TEST_STATE")" = running ]; then
  printf '4242 1 S %s/Contents/MacOS/Codex\\n' "$CODEXFAST_APP_BUNDLE"
fi
`, { mode: 0o755 });
  fs.writeFileSync(path.join(tools, "osascript"), `#!/bin/sh
printf 'quit\\n' >> "$CODEXFAST_TEST_EVENTS"
if [ "$CODEXFAST_TEST_FAILED_ACTION" = quit ]; then exit 1; fi
if [ -n "$CODEXFAST_TEST_UPDATED_PLIST" ]; then
  cp "$CODEXFAST_TEST_UPDATED_PLIST" "$CODEXFAST_APP_BUNDLE/Contents/Info.plist"
fi
printf 'stopped\\n' > "$CODEXFAST_TEST_STATE"
`, { mode: 0o755 });

  function run(args, options = {}) {
    fs.writeFileSync(eventsFile, "");
    fs.writeFileSync(infoPlist, plist("29030"));
    fs.writeFileSync(stateFile, options.running === false ? "stopped\n" : "running\n");
    const result = spawnSync(process.execPath, [launcher, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${tools}${path.delimiter}${process.env.PATH}`,
        TMPDIR: fixture,
        CODEXFAST_APP_BUNDLE: app,
        CODEXFAST_PACKAGE_TARBALL: options.tarball ?? tarball,
        CODEXFAST_MODEL_ID: "",
        CODEXFAST_TEST_STATE: stateFile,
        CODEXFAST_TEST_EVENTS: eventsFile,
        CODEXFAST_TEST_FAILED_ACTION: options.failedAction ?? "",
        CODEXFAST_TEST_UPDATED_PLIST: options.updateOnQuit ? newPlist : "",
      },
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, options.status ?? 0, output);
    return { output, events: fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean) };
  }

  const selfTests = ["__selftest-cdp-frame", "__selftest-runtime-patch-body"];
  const missing = run(["relaunch"], { status: 1, tarball: path.join(fixture, "missing.tgz") });
  assert.match(missing.output, /CODEXFAST_PACKAGE_TARBALL not found/);
  assert.deepEqual(missing.events, []);
  const corrupt = run(["relaunch"], { status: 1, tarball: invalidArchive });
  assert.match(corrupt.output, /tar .* failed/);
  assert.deepEqual(corrupt.events, []);
  assert.deepEqual(run(["relaunch"], { status: 1, failedAction: selfTests[1] }).events, selfTests);
  assert.deepEqual(run(["relaunch", "--dry-run"], { tarball: invalidArchive }).events, []);
  assert.deepEqual(run(["launch"], { status: 1 }).events, []);
  assert.deepEqual(run(["relaunch"], { status: 1, failedAction: "quit" }).events, [...selfTests, "quit"]);
  assert.deepEqual(run(["relaunch"]).events, [...selfTests, "quit", "launch"]);
  assert.deepEqual(run(["relaunch"], { running: false }).events, [...selfTests, "launch"]);
  assert.deepEqual(run(["launch"], { running: false }).events, [...selfTests, "launch"]);
  const updated = run(["relaunch"], { updateOnQuit: true });
  assert.deepEqual(updated.events, [...selfTests, "quit", ...selfTests, "launch"]);
  assert.match(updated.output, /Prepared codexfast 0\.79\.0 for 26\.1111\.71704\+29031/);

  console.log("relaunch preflight tests passed");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
