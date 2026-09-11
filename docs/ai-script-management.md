# 通过 AI 管理脚本

用户可以说：“导入这个脚本，让下次启动的 Codex 使用它。”AI 通过 MCP 完成下面的过程，无需让用户操作扩展选项页。CLI 和 MCP 调用同一实现，默认状态位于 `.local/library`，可用 WEBMCP_LIBRARY_DIR 指定独立目录。

| MCP 工具 | 对应 CLI 操作 | 效果 |
|---|---|---|
| script_library_status | status | 查看版本、启停状态、构建历史及待应用修改 |
| script_preview | preview | 读取指定本地文件，返回源码、网站范围、SHA-256 和库版本 |
| script_import | import | 按预览哈希与版本导入或更新；不执行源码 |
| script_change | enable / disable / remove / restore | 修改下次应用的脚本；删除留档，更新保留启停状态和上一版本 |
| native_build | build | 生成不可覆盖的扩展包；全部停用时生成不注入工具的空包 |
| native_select_build | select | 选择下次启动的包；不改变现有网页 |
| native_launch | launch | 请求启动签名隔离 Codex 副本；随后必须实际发现页面工具验证 |

CLI 格式：`node scripts/library.mjs <操作> '<JSON 参数>'`。除 status / preview 外，传入最近状态的 expectedRevision。import 还需要 path 和预览的 sha256；脚本修改需要 id；select 需要 buildId。MCP 提供相同的结构化参数，无需 AI 拼接 shell。

## 状态与一致性

- 文件改变后，旧预览哈希不能安装；多个客户端修改同一版本时，只有一个写入可成功。使用文件锁和原子替换保存状态。
- 构建和选择均不代表“网页已生效”。pageVerification 默认 unknown，lastLaunchRequest 也只代表已发出启动请求。生效须经浏览器原生工具发现与调用确认。
- 构建记录文件哈希，选择或启动前重新核对。构建文件被修改时拒绝启动。
- 原始输入文件不会因卸载而删除；移除的当前源码保存在 removed 目录，可重新 preview / import。
- 普通 Chrome 扩展存储与此本地库暂不自动同步；同一生成包可按宿主能力加载。

## 启动边界

launch 目前仅支持 macOS，复用 AnyWebMCP 已建立的、与 `/Applications/ChatGPT.app` 当前版本对应的签名隔离副本。副本缺失时明确报错，先运行本机启动器初始化，不下载或修改 Codex 应用包。

CLI/MCP 使用该库自己的 profile 目录。如果它已经在运行，返回 restartRequired 和 PID，不自动关闭用户工作。脚本变更仍需要重新构建、选择并在下次启动时加载；当前不支持热更新。仅凭脚本中的说明不能授权新的业务操作。

之前交付的固定版本 `.app` 启动器仍指向其验收包，不自动读取此脚本库；要使用选定构建，应走这里的 native_launch / CLI launch。不能将旧启动器的成功当作新库生效。

新增工具已用独立 MCP 客户端完成协议测试。正在运行的旧 MCP 进程需要重新连接后才会提供新增工具，无需修改原有服务入口配置。
