# WebMCP Script 0.3.0

独立网站脚本管理器与标准 MCP 本地入口。将网站能力封装成 `.user.js`，导入后供 AI 发现和调用；新增网站无需重建扩展。无云服务或账号。

![脚本库](docs/manager.png)

## 安装

需要 Node.js 22+、pnpm、支持用户脚本 API 的 Chrome 135+。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

1. 在 `chrome://extensions` 开启开发者模式，加载已解压的 `dist/extension`。
2. 在扩展详情中开启“允许用户脚本”；旧版 Chrome 通过开发者模式授权。
3. 打开 `http://127.0.0.1:17892`，再进入扩展管理页。
4. 导入 `dist/examples/local-demo.user.js`，查看名称、版本、匹配范围及源码，确认安装。

导入的语法预检需要至少一个已打开的普通 HTTP(S) 页面。浏览器内部页不支持。

## 连接 AI

支持 MCP stdio 的客户端可以直接启动入口，无需额外 Skill。将示例中的路径替换为本机绝对路径：

```json
{"mcpServers":{"webmcp-script":{"command":"/absolute/path/to/node","args":["/absolute/path/to/webmcp-script/bridge/server.mjs"]}}}
```

首次连接自动生成 `.local/pairing-token`。将文件内容粘贴到扩展配对字段。配对码仅用于本机连接，不要分享。

多个 AI 任务自动共用同一个本地 relay，各自请求和结果独立；关闭一个任务不会中断其他任务。一个 relay 连接一个扩展实例。最后一个客户端离开 60 秒后服务自动退出，下次连接自动启动。无需另外启动守护服务。

默认仅监听 `127.0.0.1:17891`。如需更换端口，在 MCP 环境变量设置 `WEBMCP_PORT`，并修改扩展“高级连接设置”中的端口。相同端口的客户端必须使用相同配对码。浏览器页面来源不能直接连接 MCP 客户端通道。

AI 调用顺序：`pages` / `visit_page` → `inspect_page` → `describe_tool` → `call_tool`。查看、访问和调用返回工具摘要，完整 schema 按需获取。调用绑定当前文档与 revision，过期调用会被拒绝。

## 管理与恢复

- 导入、替换和恢复均先预览，确认前不安装。替换要求 ID 一致，并保留原来的启用状态。
- 保留一个上一版本，可以预览后恢复；不提供完整历史或远程自动更新。
- 预览后脚本被其他窗口修改时，拒绝覆盖并要求重新预览。
- 语法检查或存储失败会报错并尝试保留旧注册；恢复失败会明确显示。
- 停用、卸载或离开匹配路径会清理工具。升级扩展后刷新已有页面。
- 连接断开后自动重连。调用超时或中途断线可能意味着结果未知，不自动重放；先核对页面实际结果。

## 脚本与权限

最小格式见 [SCRIPT_FORMAT.md](SCRIPT_FORMAT.md)，不是完整油猴实现。仅安装可信代码：脚本在页面 MAIN world 执行，可读取和修改匹配页面，不是安全沙箱。工具描述不代表业务写操作已获授权。

通过 Chrome 官方 `userScripts` 加载，无 `eval` / `new Function`。全 HTTP(S) host 权限用于跨站管理和发现，业务脚本执行仍受 `@match` 限制。不汇总跨源 iframe，不承诺枚举其他来源的原生工具。第三方依赖说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## Codex 内置浏览器

启动 demo 后，打开 `http://127.0.0.1:17892/native`。页面直接加载与 Chrome 导入相同的独立脚本；已实测原生发现、调用、刷新和 SPA 清理，无需本地 MCP bridge。

该结果验证页面加载脚本的原生路线；任意第三方网站的跨会话持久安装入口仍未完成，未修改或重启当前 Codex 宿主。

## 开发验收

```sh
pnpm test
pnpm exec playwright install chromium
TEST_EXTENSION=dist/extension pnpm test:browser
```

真实浏览器测试使用隔离 profile 和端口 17941/17992。`pnpm build` 输出加载目录与 SHA-256 清单。配置了 OpenSpec CLI 的环境另运行 `pnpm check:spec`。

macOS 可在安装依赖和 Chromium 后双击 `启动验收.command`，打开独立预览浏览器；保持终端运行，Ctrl+C 退出。避免同时重复启动同一个预览 profile。

当前为私有仓库维护的预览版，未公开发布，也未通过 Chrome Web Store 审核。

## 维护

[路线图](ROADMAP.md) · [参与贡献](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [界面设计依据](docs/ui-design.md) · [安全报告](SECURITY.md)

源码采用 MIT 许可证。CI 验证自动测试、构建与隔离浏览器流程；依赖更新由 Dependabot 每周提出 PR。
