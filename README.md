# codexfast-current-launcher

一个适用于 macOS Codex/ChatGPT Desktop 的本地运行时启动器。它会临时准备并启动 `codexfast` 会话，不修改已安装的 App 本体。

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

维护、兼容适配和发布说明见 [维护者文档](docs/MAINTAINING.md)。

上游项目：[Veath/codexfast](https://github.com/Veath/codexfast)

许可证：[MIT](LICENSE)
