# 开发与实验方案

脚本管理也可以完全通过 AI 完成：现有 MCP 服务新增本地脚本库工具，CLI 与 MCP 共用状态，支持预览、导入/更新、启停、删除留档、恢复上一版、构建、选择下次启动版本和请求隔离启动。详见 [AI 脚本管理](ai-script-management.md)。本地管理不要求 Chrome 桥接在线；浏览器连接在首次页面操作时才建立。

```sh
pnpm scripts status
pnpm scripts preview '{"path":"/absolute/path/example.user.js"}'
```

Codex 兼容方案另提供声明式扩展包生成器，直接复用 AnyWebMCP 的 MAIN world 注入方式。独立脚本可以直接使用官方 `document.modelContext.registerTool`，也可以沿用生命周期辅助函数。生成包不包含选项页、后台服务或 `userScripts` 权限。脚本变更需要生成新包并重载，不支持热更新。Codex 26.903.61454 隔离副本已验证普通网页自动注入、原生调用、刷新、完整导航、重启后自动加载，以及已加载脚本的 SPA 退出清理和返回恢复；不代表已发布稳定版。

声明式脚本首次注入取决于文档加载时的 URL。首次从不匹配 URL 通过 SPA 进入匹配路径尚不保证自动注入；已加载的辅助脚本可随路由启停。重启后测试工具需要在隔离副本重新打开任务来连接，脚本注册本身自动完成。

```sh
pnpm bundle:native /absolute/path/to/new-extension-dir examples/local-demo.user.js
pnpm test:native-browser
```

输出目录必须不存在，以免覆盖已有可用包。对本机扩展包的安装仍受宿主支持与授权约束。Chrome 管理器安装见 [首次使用](getting-started.md)，不代表 Codex 支持这些入口。

## 管理与恢复

- 新建、编辑与恢复均先预览，确认前不安装。替换要求 ID 一致，并保留原来的启用状态。
- 保留一个上一版本，可以预览后恢复；不提供完整历史；远程检查与自动更新见 [AI 脚本管理](ai-script-management.md#检查与自动更新)。
- 预览后脚本被其他窗口修改时，拒绝覆盖并要求重新预览。
- 语法检查或存储失败会报错并尝试保留旧注册；恢复失败会明确显示。
- 停用或卸载脚本会撤销归属到它的原生工具，旧调用入口失效，页面其他工具保留；工具列表显示脚本来源。普通脚本更新或重新启用后需要刷新已有页面。来源追踪覆盖范围见 `SCRIPT_FORMAT.md`，不承诺清理任意脚本副作用；升级扩展后也请刷新已有页面。
- 连接断开后自动重连。调用超时或中途断线可能意味着结果未知，不自动重放；先核对页面实际结果。

## 脚本与权限

`@id` 可省略，按 `@namespace` 与 `@name` 生成内部标识；误粘贴的同文字 Markdown `@match` 链接会还原为纯网址。最小格式见 [SCRIPT_FORMAT.md](../SCRIPT_FORMAT.md)，不是完整油猴实现。仅安装可信代码：脚本在页面 MAIN world 执行，可读取和修改匹配页面，不是安全沙箱。工具描述不代表业务写操作已获授权。

通过 Chrome 官方 `userScripts` 加载，无 `eval` / `new Function`。全 HTTP(S) host 权限用于跨站管理和发现，业务脚本执行仍受 `@match` 限制。不汇总跨源 iframe，不承诺枚举其他来源的原生工具。第三方依赖说明见 [THIRD_PARTY.md](../THIRD_PARTY.md)。

## Codex 内置浏览器

启动 demo 后，打开 `http://127.0.0.1:17892/native`。页面直接加载与 Chrome 导入相同的独立脚本；已实测原生发现、调用、刷新和 SPA 清理，无需本地 MCP bridge。

该结果验证页面加载脚本的原生路线；任意第三方网站的跨会话持久安装入口仍未完成，未修改或重启当前 Codex 宿主。

## 开发验收

```sh
pnpm test
pnpm exec playwright install chromium
TEST_EXTENSION=dist/extension pnpm test:browser
```

`pnpm test:ui` 在普通 HTTP 测试页中使用模拟的 Chrome 消息验证界面与 CodeMirror，不代表扩展安装验收；截图在 `../ui-acceptance/`。`pnpm test:browser` 依次执行界面测试与原生声明式扩展包测试（`test:native-browser`）。旧 `tests/browser-e2e.mjs` 尚依赖旧界面与权限页面，保留待迁移，不再由测试命令调用。`pnpm build` 输出加载目录与 SHA-256 清单。配置了 OpenSpec CLI 的环境另运行 `pnpm check:spec`。

旧 `启动验收.command` 预览脚本仍依赖扩展管理界面，仅保留开发排查，不作为公测安装或自动验收入口。
