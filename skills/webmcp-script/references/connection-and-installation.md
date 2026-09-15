# 连接与安装

## 连接 Chrome

用户要求连接或修复时，先核对已有 webmcp-script MCP 配置、Node.js 22+ 和实际安装目录。
运行安装目录的 `node setup.mjs` 获取 stdio 配置；它只打印配置，不启动服务或修改客户端。
保留其他服务，已有配置核对路径即可，不重复添加。预构建包自带依赖，不需要 install 或编译。
若需下载，使用用户指定或已核实的官方 GitHub Release，核对 SHA256SUMS.txt，不能猜安装路径。

服务加载后调用 `connection_info` 启动桥接。已有配对时先调用 `pages` 验证自动重连，成功则不要求重新粘贴连接码。尚未配对或仍未连通时，再将 pairingCode 原样私下交给用户粘贴到扩展连接页。
连接断开不等于配对失效：桥接会在无 AI 客户端时空闲退出，扩展保留配对并自动重连；WebSocket 失败本身无法区分服务未启动、鉴权失败或其他浏览器占用。
配对码不落入仓库、共享文件或报告。已有服务缺工具时重新加载该服务，不另建重复服务。
用户确认粘贴后调用 `pages`；只有真实返回 Chrome 页面才能报告页面发现成功。
连接检查不授权调用网站业务写工具。网页不支持、没有工具和桥接断连是不同状态。

## 安装用户脚本

优先发现 `browser_script_get` / `browser_script_preview` / `browser_script_commit`：用 catalog 定位脚本，get 读取当前或上一版源码，preview 传 action（import / enable / disable / remove / restore；import 传 source，其余传 id），审阅前后范围、哈希和执行影响，再在用户已有授权内 commit 其五分钟一次性 token。无需用户手动粘贴，也不重复索取已给出的授权。get 分页时核对 sha256 一致。预览失效或提交结果未知时先回读，不重试旧 token；扩展重载后重新预览。保存后检查 pageErrors，并重新发现页面工具，普通脚本更新或重新启用后需刷新页面。卸载删除当前和上一版，需保留则先导出。

旧扩展没有上述工具时，说明需要同时更新扩展和 MCP。兼容路径：WebMCP Script Chrome 扩展：管理面板 → 新建脚本 → 粘贴完整源码 → 保存 → 核对范围并确认保存。
替换保留脚本 ID 与用户启用状态；更新后刷新目标网页，重新发现并做只读验收。
其他管理器使用它自身支持的安装与 MAIN world 机制，不能假设 GM API 兼容。

如果客户端提供 `script_preview` / `script_import`，先阅读其 schema 与存储范围。
本地 CLI/MCP 脚本库和 Chrome 扩展存储彼此独立；导入本地库不等于安装到当前 Chrome。
不要为了安装 Chrome 脚本擅自启动隔离浏览器。临时 evaluate 注入也不是持久安装。
