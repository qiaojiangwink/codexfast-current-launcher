# codexfast-current-launcher

一个适用于 macOS Codex/ChatGPT Desktop 的本地运行时启动器。它会临时准备并启动 `codexfast` 会话，不修改已安装的 App 本体。

这个项目主要面向通过中转站、自定义 Provider 或 API Key 使用 Codex 的用户。这类登录方式即使后端支持相应模型，也可能看不到官方 Fast 入口或模型菜单。使用官方 ChatGPT 账号登录且界面功能正常的用户，一般不需要使用本项目。

## 当前兼容情况

以下是 2026-07-13 的验证结果：

| 客户端版本 | 客户端表现 | 本项目的作用 |
| --- | --- | --- |
| `26.707.31428+5059` | 上一版本可能不显示 GPT-5.6，Fast 入口也不可见 | 补充 GPT-5.6 模型菜单和 Fast 相关入口 |
| `26.707.41301+5103` | 官方已恢复模型显示，但 Fast 入口仍不可见 | 主要补充 Fast 相关入口，并保留模型菜单兼容处理 |
| `26.707.61608+5200` | 官方已内置 GPT-5.6；中转站、API Key 等场景仍可能缺少 Fast | 已实测 Fast 设置、Speed 菜单、`/fast` 和 Service Tier 相关运行时目标均能命中 |
| `26.707.62119+5211` | 官方模型显示保持正常；自定义 Provider 等场景仍保留 Fast 相关本地判断 | 使用 `codexfast 0.51.0` 实测全部 Fast 相关目标均能命中，隔离启动可正常到达 ready 状态 |

项目会根据客户端更新继续适配。每次更新后的实际支持情况，以仓库最新说明和运行时输出为准。

## 使用前准备

- macOS
- 已安装 Codex 或 ChatGPT Desktop
- Node.js 18.12 或更高版本
- 首次运行时可以访问 npm

检查 Node.js：

```zsh
node -v
```

## 快速开始

```zsh
git clone https://github.com/qiaojiangwink/codexfast-current-launcher.git
cd codexfast-current-launcher
node bin/launch-codexfast-current.mjs relaunch
```

项目没有需要安装的 Node.js 依赖，因此不需要运行 `npm install`。

`relaunch` 会先退出正在运行的 Codex/ChatGPT Desktop，再通过临时运行时重新启动。看到下面的提示即表示启动完成：

```text
Runtime launch completed.
```

使用期间请保持这个终端窗口运行。退出 Codex/ChatGPT Desktop 后，本次临时运行时会话随之结束。

## 查看当前状态

```zsh
node bin/launch-codexfast-current.mjs status
```

该命令会显示检测到的 App、版本号、构建号以及当前运行状态。

## 确认是否生效

运行 `relaunch` 后，终端会显示 `Patched targets:`。具体条目会随 App 版本变化，只要最终出现 `Runtime launch completed.`，就说明临时运行时已经启动。

随后可在 App 中检查 Fast 模式或模型菜单。界面出现某个模型不代表账号一定拥有服务端调用权限，最终仍以实际请求结果为准。

## App 更新后

进入仓库并更新脚本，然后重新启动：

```zsh
git pull
node bin/launch-codexfast-current.mjs status
node bin/launch-codexfast-current.mjs relaunch
```

如果新版 App 不再显示 Fast 模式或目标模型，请在 Issue 中附上 App 版本和终端里的 `Patched targets:`，提交前先删除用户名、目录路径等隐私信息。

## 可选设置

指定模型：

```zsh
CODEXFAST_MODEL_ID=gpt-5.6 node bin/launch-codexfast-current.mjs relaunch
```

指定 App 路径：

```zsh
CODEXFAST_APP_BUNDLE=/Applications/ChatGPT.app node bin/launch-codexfast-current.mjs relaunch
```

网络无法下载 `codexfast` 时，可使用本地包：

```zsh
CODEXFAST_PACKAGE_TARBALL=/path/to/codexfast.tgz node bin/launch-codexfast-current.mjs relaunch
```

## 常见问题

### 提示 App 已经在运行

请使用 `relaunch`，不要重复执行 `launch`。

### 界面有模型，但发送失败

本项目只能调整本地界面和运行时请求配置，不能授予账号模型权限或绕过服务端限制。

### 更新后没有 Fast 模式或目标模型

先执行 `git pull` 再重新运行 `relaunch`。如果仍未出现，通常表示新版 App 的代码结构发生了变化，需要更新适配。

## 说明

这是非官方开源项目，与 OpenAI 无隶属关系。使用者应自行承担运行风险，本项目不分发 OpenAI App 或其资源文件。

社区：[LINUX DO](https://linux.do)

维护、兼容适配和发布说明见 [维护者文档](docs/MAINTAINING.md)。

上游项目：[Veath/codexfast](https://github.com/Veath/codexfast)

许可证：[MIT](LICENSE)
