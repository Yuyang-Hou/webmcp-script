# 第三方组件

本项目使用标准协议 SDK，不复刻完整 MCP 实现。

| 组件 | 锁定版本（pnpm-lock.yaml） | 许可证 | 用途 |
|---|---|---|---|
| @modelcontextprotocol/sdk | 1.30.0 | MIT | MCP stdio 服务与测试客户端 |
| ws | 8.21.3 | MIT | 扩展与本地服务连接 |
| zod | 3.25.76 | MIT | MCP 参数边界校验 |
| playwright | 1.63.0 | Apache-2.0 | 仅真实浏览器测试 |

以上许可证已读取安装包 package.json。完整许可随 node_modules 内相应包提供，间接依赖由 pnpm-lock.yaml 固定。

AnyWeb MCP 仅用于架构调研；本项目未复制其站点业务代码或启动器。未将外部调研资料或本机验收信息作为产品运行依赖。
