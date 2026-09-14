# 第三方组件

本项目使用标准协议 SDK，不复刻完整 MCP 实现。

| 组件 | 锁定版本（pnpm-lock.yaml） | 许可证 | 用途 |
|---|---|---|---|
| @modelcontextprotocol/sdk | 1.30.0 | MIT | MCP stdio 服务与测试客户端 |
| ws | 8.21.3 | MIT | 扩展与本地服务连接 |
| zod | 3.25.76 | MIT | MCP 参数边界校验 |
| CodeMirror 6 / @codemirror/* | 见 pnpm-lock.yaml | MIT | 编辑器、JavaScript 高亮、搜索与撤销 |
| esbuild | 0.28.2 | MIT | 本地打包编辑器，运行时不使用 CDN |
| playwright | 1.63.0 | Apache-2.0 | 仅真实浏览器测试 |

以上许可证已读取安装包 package.json。完整许可随 node_modules 内相应包提供，间接依赖由 pnpm-lock.yaml 固定。

AnyWeb MCP 仅用于架构调研；本项目未复制其站点业务代码或启动器。未将外部调研资料或本机验收信息作为产品运行依赖。

扩展包包含 `THIRD_PARTY_LICENSES.txt`，按实际打包输入收集 CodeMirror 及其间接依赖的完整许可证。

预构建 ZIP 根目录另附 `THIRD_PARTY_LICENSES.txt`，收集 MCP 服务和 CLI 实际打包依赖的许可证；生成的 JS 旁保留 esbuild 的许可注释文件。Node.js 不随包分发，需要用户自行安装。
