<p align="center"><img src="extension/icons/icon-128.png" width="88" height="88" alt="WebMCP Script 恐龙头标志"></p>
<h1 align="center">WebMCP Script</h1>
<p align="center">让 AI 使用网页工具，让网站脚本可以自由分享。</p>
<p align="center"><a href="https://github.com/Yuyang-Hou/webmcp-script/releases/tag/v0.4.0-beta.2">下载公测版</a> · <a href="docs/getting-started.md">安装与首次使用</a> · <a href="https://github.com/Yuyang-Hou/webmcp-script/issues/new/choose">反馈问题</a></p>

**0.4.0-beta.2 · 开发者公测**。Chrome 扩展负责管理独立 `.user.js` 脚本，本机 MCP 服务把网页原生 WebMCP 工具提供给 AI。网站已有工具和脚本补充的工具走同一条原生发现与调用链路。

下载预构建 ZIP 即可加载扩展，连接 AI 需要 Node.js 22+，无需安装项目依赖或编译。尚未上架 Chrome Web Store；浏览器仍需提供实验性原生 WebMCP 接口。

## 可以做什么

- 查看当前网页的工具，已识别的来源按页面或脚本展示。
- 粘贴标准用户脚本，使用 CodeMirror 编辑；保存前预览网站范围，支持启停、删除和上一版恢复。
- 脚本直接使用 `document.modelContext.registerTool`，不必依赖项目专属接口。
- 连接支持 stdio MCP 的 AI 客户端，发现页面、读取工具 schema、执行经过用户授权的操作。
- 在扩展图标查看本页工具数量和连接异常；多个 AI 任务共享本机连接。

![管理面板](docs/manager.png)

界面截图使用 example.com 测试数据，不代表该网站实际提供这些工具。

## 开始公测

需要 **启用 WebMCP 的 Chromium**，连接 AI 另需 **Node.js 22+**。本项目实测 Chromium 153；安装扩展所需的 userScripts API 与原生 WebMCP 是两个不同条件。

1. 下载公测页的 **webmcp-script-0.4.0-beta.2.zip**，解压到固定目录，保留包内所有文件。不要选 Source code。
2. 在浏览器开启 WebMCP 测试功能，再加载解压目录中的 **extension** 并允许用户脚本。[逐步安装指南](docs/getting-started.md)包含具体入口和排错方法。
3. 扩展 → 管理面板 → **连接** → 复制连接说明发给 AI，再粘贴 AI 返回的连接码。
4. 请 AI 调用 `pages` 检查页面。首次验证可使用本地示例，避免用业务写操作试连通性。

AI 可运行包内 `node setup.mjs` 获取这台电脑的 MCP 配置。该命令只输出配置，不修改客户端或启动服务；移动目录后重新生成并更新配置。连接页提供只读检查。连接码仅用于本机配对，不能分享。更新时见[升级与退出公测](docs/getting-started.md#升级与退出公测)。源码开发另见[开发文档](docs/development.md)。

## 公测边界

| 范围 | 状态 |
|---|---|
| Chrome 扩展、脚本编辑与 MCP 桥接 | 本次公测主入口 |
| 原生发现、调用与脚本停用清理 | 已有自动化与隔离浏览器验证；归属范围见脚本格式说明 |
| Windows / Linux 用户桌面 | 尚未完整人工验收；Linux CI 不等于用户桌面验收 |
| Codex 内置浏览器 | 实验路线，依赖特定 macOS 隔离副本与启动方式，不属于开箱即用支持 |
| 热更新 | 普通脚本更新或重新启用后需刷新页面；声明式包需重新生成并重载 |
| 脚本兼容性 | 支持所列元数据，不是完整油猴实现，不支持全部 GM API |

浏览器未提供原生接口时会报“不支持”，不会以自建工具表冒充原生 WebMCP。只管理当前文档工具，不汇总跨源 iframe。调用超时或断线可能意味着结果未知，不自动重放；脚本可读取和修改匹配页面，工具可调用不等于业务操作已获授权。

## 文档与维护

### AI 自动发现（源码新增，旧版 ZIP 尚不包含）

AI 可用 `browser_catalog` 搜索当前 Chrome 扩展已安装的脚本及保存的项目入口，无需先打开页面，也无需每次安装后修改记忆或项目提示文件。目录直接读取扩展存储，返回名称、说明、版本、范围、启停状态和脚本自带的参数化入口；它与 CLI 本地脚本库不同，也不代表页面原生工具已就绪。

优先用 `browser_resolve_entry` 传入目录中的脚本 ID、版本、入口 ID 和用户确认的参数，获取精确 URL，再用 `visit_page` 直接打开并发现工具。入口随脚本的 `@webmcp-entry` 声明安装和更新，参数示例不是默认值。解析不会导航或执行脚本，也不证明目标项目存在。

未声明入口的旧脚本，首次确认项目页面后，用 `browser_entry` 保存名称（区分项目和环境）、pageId 与观察到的精确 URL；新建的 expectedUrl 为 null，更新和删除使用目录返回的旧 URL。页面跳转或并发修改会拒绝保存。后续查询目录，再用 `pages` 或 `visit_page` 打开入口、发现工具即可。入口仅存在当前 Chrome 扩展本地，可用 remove 删除；不保存凭据或含令牌的网址。

源码验收：`pnpm build && pnpm test:catalog-browser`，使用隔离 Chromium、真实扩展安装和 stdio MCP 验证关闭页面后的目录发现与入口复用，不访问业务网站。

这些工具需要扩展和 MCP 同时更新并重新连接。安装清单不做网站代码变更检测，不保证已安装脚本仍兼容网站；实际能力仍以当前页面原生发现和只读验证为准。

### 配套 skill：WebMCP Script

[WebMCP Script skill](skills/webmcp-script/SKILL.md)（原 web-code）随源码及后续预构建包维护，指导 AI 编写、验证、安装和修复网站用户脚本。调用名为 `$webmcp-script`；它不替代扩展或 MCP 服务，也不自动授权网站操作。已发布的旧版 ZIP 不包含此新增文件。

安装到 Codex：将包内 `skills/webmcp-script` 整个目录复制到 `${CODEX_HOME:-$HOME/.codex}/skills/`，重新加载 skill 目录或新开任务。已有同名目录先核对，避免覆盖个人修改。从旧 `web-code` 迁移时，先将旧目录移到 skills 目录之外备份，再安装新名称，避免重复发现。其他客户端使用其支持的 skill 目录。

[脚本格式与模板](SCRIPT_FORMAT.md) · [隐私与数据流](PRIVACY.md) · [安全报告](SECURITY.md) · [参与贡献](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [路线图](ROADMAP.md) · [开发与实验方案](docs/development.md) · [AI 脚本管理](docs/ai-script-management.md)

源码采用 MIT 许可证；依赖许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。本项目为独立社区项目，与 Google、OpenAI 没有官方隶属关系。
