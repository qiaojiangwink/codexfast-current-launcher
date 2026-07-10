# codexfast-current-launcher

一个 macOS 本地运行时启动器，用来为用户自己安装的 Codex/ChatGPT Desktop 准备并启动 `codexfast` runtime patch 会话。

它**不修改** `/Applications/ChatGPT.app` 或 `/Applications/Codex.app` 本体，也**不分发** OpenAI 的 app、`app.asar`、账号数据或会话数据。退出桌面 app 后，本次 runtime patch 会话结束。

## 功能

- 自动检测 `/Applications/Codex.app` 或 `/Applications/ChatGPT.app`。
- 从 `Info.plist` 读取真实可执行文件名，兼容新版 `ChatGPT.app`。
- 将当前本地 app 版本临时加入 `codexfast` 兼容列表。
- 启动 runtime patch 会话，不直接改 `app.asar`。
- 支持 `status`、`prepare`、`isolated-test`、`launch`、`relaunch`。
- 对新版模型菜单增加当前模型列表覆盖逻辑。

## 使用前要求

1. 系统：macOS。
2. 已安装 OpenAI Codex/ChatGPT Desktop，bundle id 应为 `com.openai.codex`。
3. 已安装 Node.js 18.12 或更高版本。
4. 可以联网下载 `codexfast`，或者准备本地 `codexfast-*.tgz` 包。

检查 Node.js：

```zsh
node -v
```

检查桌面 app 是否存在：

```zsh
ls /Applications/ChatGPT.app /Applications/Codex.app 2>/dev/null
```

## 安装教程

克隆仓库：

```zsh
git clone https://github.com/qiaojiangwink/codexfast-current-launcher.git
cd codexfast-current-launcher
```

检查脚本语法：

```zsh
npm run check
```

运行自测：

```zsh
npm test
```

如果自测通过，会看到：

```text
launch-codexfast-current tests passed
```

## 快速启动教程

先查看当前检测到的 app 和版本：

```zsh
node bin/launch-codexfast-current.mjs status
```

正常会看到类似：

```text
App bundle: /Applications/ChatGPT.app
App executable: ChatGPT
Version key: 26.707.31428+5059
Codex.app main running: no
```

启动或重启 runtime patch 会话：

```zsh
node bin/launch-codexfast-current.mjs relaunch
```

运行成功后，终端会显示 `Runtime launch completed.`。使用期间不要关闭这个终端窗口。

如果已经打开了 Codex/ChatGPT Desktop，`relaunch` 会先请求它退出，再用 runtime patch 方式重新启动。

## 选择模型覆盖

默认模型覆盖为 `gpt-5.6`。你也可以手动指定：

```zsh
CODEXFAST_MODEL_ID=gpt-5.6 node bin/launch-codexfast-current.mjs relaunch
```

如果想自定义显示名称：

```zsh
CODEXFAST_MODEL_ID=gpt-5.6 CODEXFAST_MODEL_DISPLAY_NAME="GPT-5.6" node bin/launch-codexfast-current.mjs relaunch
```

注意：UI 显示某个模型不等于后端一定能调用成功。账号、provider 或后端仍然需要真正支持这个模型 id。

## 指定 app 路径

默认会自动检测 `/Applications/Codex.app` 和 `/Applications/ChatGPT.app`。如果你想指定某个 app：

```zsh
CODEXFAST_APP_BUNDLE=/Applications/ChatGPT.app node bin/launch-codexfast-current.mjs relaunch
```

## 使用本地 codexfast 包

默认会执行 `npm pack codexfast@latest` 下载上游包。如果你的网络不稳定，可以使用本地 tarball：

```zsh
CODEXFAST_PACKAGE_TARBALL=/path/to/codexfast-0.48.0.tgz node bin/launch-codexfast-current.mjs relaunch
```

不建议把 `codexfast-*.tgz` 提交到公开仓库。如果一定要 vendoring，请保留上游 MIT License 和来源说明。

## 常用命令

查看状态：

```zsh
node bin/launch-codexfast-current.mjs status
```

只准备临时 launcher，不启动 app：

```zsh
node bin/launch-codexfast-current.mjs prepare
```

隔离 profile 测试：

```zsh
node bin/launch-codexfast-current.mjs isolated-test
```

普通启动，要求 app 当前没有运行：

```zsh
node bin/launch-codexfast-current.mjs launch
```

推荐启动方式，会自动处理已运行的 app：

```zsh
node bin/launch-codexfast-current.mjs relaunch
```

预演重启流程，不真正退出 app：

```zsh
node bin/launch-codexfast-current.mjs relaunch --dry-run
```

## 怎么确认是否生效

运行 `relaunch` 后看终端里的 `Patched targets:`。

当前新版模型菜单路径命中时，会出现类似：

```text
Patched targets:
  Speed service tier allowance
  Speed service tier request allowance
  Composer Intelligence Speed menu
  Fast slash command
  GPT-5.6 model id literals
  GPT-5.6 model list current
```

如果没有看到 `GPT-5.6 model list current`，说明当前 app 版本的模型菜单代码又变了，需要更新匹配逻辑。

## 更新 app 后怎么办

每次 Codex/ChatGPT Desktop 更新后，先运行：

```zsh
node bin/launch-codexfast-current.mjs status
node bin/launch-codexfast-current.mjs prepare
```

如果 `prepare` 成功，再运行：

```zsh
node bin/launch-codexfast-current.mjs relaunch
```

如果更新后 UI 又不显示模型或快速模式，把 `Patched targets:` 那段输出复制到 issue 里。

## 常见问题

### 提示 app 已经在运行

使用：

```zsh
node bin/launch-codexfast-current.mjs relaunch
```

不要直接重复运行 `launch`。

### UI 显示 GPT-5.6，但发送失败

这通常不是本地脚本问题。脚本只能影响本地 UI/runtime 行为，后端仍需要支持这个模型名和服务层级。

### 更新后没有 GPT-5.6

先确认 `Patched targets:` 是否包含：

```text
GPT-5.6 model id literals
GPT-5.6 model list current
```

如果没有，说明新版 app 的前端代码结构变了。

### npm 下载失败

可以手动准备 `codexfast-*.tgz`，然后：

```zsh
CODEXFAST_PACKAGE_TARBALL=/path/to/codexfast-0.48.0.tgz node bin/launch-codexfast-current.mjs relaunch
```

## 开源边界

这个仓库只应包含脚本和文档。不要提交：

- `app.asar`
- `.app` 应用包
- `.dmg`、`.zip` 安装包
- 账号、token、session、cookie
- `~/.codex`
- 本地 patched app 备份
- 终端输出里包含隐私的信息

`.gitignore` 已经默认排除这些高风险文件。

## 免责声明

This is an unofficial local launcher/wrapper. It is not affiliated with OpenAI.

Use at your own risk. This project does not grant server-side model access and does not redistribute OpenAI application binaries or resources.

## 上游项目

本项目会下载并准备 MIT-licensed 上游包：

- `codexfast`: https://github.com/Veath/codexfast

## License

MIT
