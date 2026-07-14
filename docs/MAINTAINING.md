# 维护者文档

本文面向维护者和贡献者。普通使用方法请查看仓库根目录的 [README](../README.md)。

## 项目边界

本仓库只维护本地启动脚本、测试和文档。启动器会下载并临时准备 MIT 许可的上游 `codexfast`，不会直接修改 `/Applications/Codex.app`、`/Applications/ChatGPT.app` 或其中的 `app.asar`。

启动器不能授予服务端模型权限，也不能保证某个模型 ID、服务层级或界面入口长期可用。

## 适配范围

项目主要处理通过中转站、自定义 Provider 或 API Key 使用 Codex 时，Fast 入口和模型菜单因认证路径或客户端判断而不可见的问题。官方 ChatGPT 登录路径应单独验证，不应把本项目描述为所有用户都必须使用的工具。

当前适配记录：

| 客户端版本 | 验证结果 |
| --- | --- |
| `26.707.31428+5059` | 可补充 GPT-5.6 模型菜单及 Fast 相关入口 |
| `26.707.41301+5103` | 官方模型显示已恢复；关键 Fast、service tier 和模型兼容补丁目标仍能命中 |
| `26.707.61608+5200` | 使用 `codexfast 0.50.0` 扫描真实 `app.asar` 中 4,951 个 JS 文件；Fast、Speed、`/fast`、service tier 和自动更新相关目标全部命中，缺失目标为 0 |
| `26.707.62119+5211` | 使用 `codexfast 0.51.0` 扫描真实 `app.asar` 中 4,950 个 JS 文件；7 类必需目标全部命中，缺失目标为 0，隔离运行时启动成功到达 ready 状态 |
| `26.707.71524+5263` | 使用 `codexfast 0.51.0` 扫描真实 `app.asar` 中 4,947 个 JS 文件；7 类必需目标全部命中，缺失目标为 0，隔离运行时启动成功到达 ready 状态 |
| `26.707.72221+5307` | 使用 `codexfast 0.52.0` 扫描真实 `app.asar` 中 4,948 个 JS 文件；7 类必需目标全部命中，缺失目标为 0，隔离运行时启动成功到达 ready 状态 |

版本表记录的是验证时的客户端行为，不代表同一版本下所有账号、中转站或服务端配置都会得到相同结果。

## 仓库结构

- `bin/launch-codexfast-current.mjs`：版本检测、临时兼容处理、运行时启动和进程管理。
- `test/test-launch-codexfast-current.mjs`：启动器回归测试。
- `README.md`：普通用户使用说明。
- `.gitignore`：阻止 App 文件、上游包、日志和临时产物进入仓库。

## 本地检查

提交前至少运行：

```zsh
npm run check
npm test
git diff --check
```

检查当前 App 检测结果：

```zsh
node bin/launch-codexfast-current.mjs status
```

只准备临时启动器并运行内置自测：

```zsh
node bin/launch-codexfast-current.mjs prepare
```

启动隔离 Profile，确认运行时能够到达 ready 状态并自动清理：

```zsh
node bin/launch-codexfast-current.mjs isolated-test
```

预演重启流程，不退出当前 App：

```zsh
node bin/launch-codexfast-current.mjs relaunch --dry-run
```

## App 更新后的兼容检查

1. 执行 `status`，确认 App 路径、真实可执行文件名、版本号和构建号读取正确。
2. 执行 `prepare`，确认 CDP frame 和 runtime patch body 自测通过。
3. 执行 `isolated-test`，确认输出 `Runtime launch completed.` 并完成清理。
4. 检查 `Patched targets:`。条目会随 App 代码变化，不应在用户文档中承诺固定列表。
5. 仅在隔离测试通过后，使用 `relaunch` 验证真实 App。

如果 `prepare` 通过但某个界面入口缺失，应检查新版渲染代码中的模型列表、Fast 命令和 service tier 判断是否改变。优先更新精确匹配逻辑，并为变化补充回归测试。

## 环境变量

- `CODEXFAST_MODEL_ID`：覆盖模型 ID，默认值为 `gpt-5.6`。
- `CODEXFAST_MODEL_DISPLAY_NAME`：覆盖模型显示名称。
- `CODEXFAST_APP_BUNDLE`：指定待检测的 App 路径。
- `CODEXFAST_PACKAGE_TARBALL`：使用本地 `codexfast` tarball。
- `CODEXFAST_DEBUG_RUNTIME`：启用上游运行时调试输出。

## 开源与发布检查

公开提交中不得包含：

- OpenAI App、`app.asar`、`.dmg`、`.zip` 或其他应用资源。
- `codexfast-*.tgz` 等上游二进制或打包产物。
- 账号、token、session、cookie、API key 或授权请求头。
- `~/.codex`、用户目录、临时目录和运行日志。
- 本地修改后的 App 备份。

发布前建议从公开 HTTPS 地址克隆到新目录，再运行：

```zsh
npm run check
npm test
node bin/launch-codexfast-current.mjs status
node bin/launch-codexfast-current.mjs prepare
node bin/launch-codexfast-current.mjs isolated-test
```

同时确认：

- 默认分支和本地提交一致。
- README 中的克隆地址和相对链接有效。
- README 保留对 [LINUX DO](https://linux.do) 社区的公开链接。
- 启动脚本保留可执行权限。
- `npm pack --dry-run` 只包含预期文件。

## 上游与许可证

本项目会下载并准备上游项目 [Veath/codexfast](https://github.com/Veath/codexfast)。如需在其他分发形式中包含上游代码或包，应保留其 MIT License 和来源说明。

本仓库自身使用 [MIT License](../LICENSE)。
