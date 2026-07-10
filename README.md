# codexfast-current-launcher

Runtime launcher wrapper for Codex/ChatGPT Desktop on macOS.

This project prepares and runs the upstream `codexfast` runtime patcher against the currently installed OpenAI Codex/ChatGPT Desktop app. It does not modify `ChatGPT.app` / `Codex.app` on disk and does not distribute any OpenAI application files.

## What It Does

- Detects `/Applications/Codex.app` or `/Applications/ChatGPT.app`.
- Reads the real app executable name from `Info.plist`.
- Adds the current local app version/build to the temporary `codexfast` compatibility list.
- Runs the app through a temporary runtime patch session.
- Keeps the Terminal process alive while the patched desktop session is in use.
- Adds a current-model override path for newer builds where the model picker no longer uses the older `codexfast` model-list selector.

## Requirements

- macOS.
- Node.js 18.12 or newer.
- npm access to download `codexfast`, or a local `codexfast-*.tgz` tarball.
- An installed OpenAI Codex/ChatGPT Desktop app with bundle id `com.openai.codex`.

## Usage

```zsh
node bin/launch-codexfast-current.mjs status
node bin/launch-codexfast-current.mjs relaunch
```

Keep the Terminal process running while you use Codex/ChatGPT Desktop. Quit the desktop app to end the runtime patch session.

To choose a model label/id override:

```zsh
CODEXFAST_MODEL_ID=gpt-5.6 node bin/launch-codexfast-current.mjs relaunch
```

To use a specific app bundle:

```zsh
CODEXFAST_APP_BUNDLE=/Applications/ChatGPT.app node bin/launch-codexfast-current.mjs relaunch
```

To use a local `codexfast` tarball:

```zsh
CODEXFAST_PACKAGE_TARBALL=/path/to/codexfast-0.48.0.tgz node bin/launch-codexfast-current.mjs relaunch
```

## Will It Work For Everyone?

Not guaranteed. It can produce the same local UI/runtime effect only when the target machine has a compatible macOS app build and the runtime patch signatures still match that build.

It also cannot grant server-side access. Even if the UI shows a model such as `GPT-5.6`, the account, provider, or backend still must actually accept that model id and service tier.

Check the launcher output after `relaunch`. For the current tested path, useful lines include:

```text
Patched targets:
  GPT-5.6 model id literals
  GPT-5.6 model list current
```

## Commands

```zsh
node bin/launch-codexfast-current.mjs status
node bin/launch-codexfast-current.mjs prepare
node bin/launch-codexfast-current.mjs isolated-test
node bin/launch-codexfast-current.mjs launch
node bin/launch-codexfast-current.mjs relaunch
```

## Safety Notes

- This wrapper does not patch `app.asar` directly.
- This wrapper does not include OpenAI app binaries or resources.
- Do not commit local `app.asar` files, patched app bundles, app backups, account files, session data, or temporary runtime output.
- The runtime patch is experimental and may stop working after app updates.

## Upstream

This wrapper downloads and prepares the MIT-licensed upstream package:

- `codexfast`: https://github.com/Veath/codexfast

## License

MIT
