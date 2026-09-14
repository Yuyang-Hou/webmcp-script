# 参与维护

先用 Issue 说明用户目标与验收条件。问题优先复现；不把工具注册成功当成安装或调用成功。

使用 Node.js 22+ 和 pnpm。功能分支使用短横线命名，例如 `fix-script-preview`。提 PR 前运行 `pnpm test`、`pnpm build`；影响 UI、扩展或桥接时运行 `pnpm test:browser`，本地有 OpenSpec CLI 时运行 `pnpm check:spec`。同步 `openspec/specs/product/spec.md` 的行为与边界。

UI 使用现有原生 HTML/CSS，设计依据见 `docs/ui-design.md`。验证桌面与 390px 窄屏、键盘操作、空状态、错误和确认取消；不要只提供理想状态截图。

每次发布更新版本、CHANGELOG，核对构建清单与浏览器验收来自同一产物。CI 不自动发布。依赖升级以 Dependabot PR 追踪，通过检查后再评估合并。

发布前运行 `pnpm test:package`：生成 ZIP 并在独立临时目录验证，不借用源码的 node_modules。构建测试需要系统 zip/unzip，用户使用预构建包不需要这些开发工具。该测试使用模拟扩展传输，不代替真实浏览器验收。

禁止提交 `.local`、配对码、浏览器 profile、真实业务数据或本机专属 `mcp-config.json`。公开截图也需脱敏。敏感问题按 SECURITY.md 的受限报告流程处理，不在 Issue 中粘贴凭据。
