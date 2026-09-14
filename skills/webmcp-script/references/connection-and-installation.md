# 连接与安装

## 连接 Chrome

用户要求连接或修复时，先核对已有 webmcp-script MCP 配置、Node.js 22+ 和实际安装目录。
运行安装目录的 `node setup.mjs` 获取 stdio 配置；它只打印配置，不启动服务或修改客户端。
保留其他服务，已有配置核对路径即可，不重复添加。预构建包自带依赖，不需要 install 或编译。
若需下载，使用用户指定或已核实的官方 GitHub Release，核对 SHA256SUMS.txt，不能猜安装路径。

服务加载后调用 `connection_info`，将 pairingCode 原样私下交给用户粘贴到扩展连接页。
配对码不落入仓库、共享文件或报告。已有服务缺工具时重新加载该服务，不另建重复服务。
用户确认粘贴后调用 `pages`；只有真实返回 Chrome 页面才能报告页面发现成功。
连接检查不授权调用网站业务写工具。网页不支持、没有工具和桥接断连是不同状态。

## 安装用户脚本

WebMCP Script Chrome 扩展：管理面板 → 新建脚本 → 粘贴完整源码 → 保存 → 核对范围并确认保存。
替换保留脚本 ID 与用户启用状态；更新后刷新目标网页，重新发现并做只读验收。
其他管理器使用它自身支持的安装与 MAIN world 机制，不能假设 GM API 兼容。

如果客户端提供 `script_preview` / `script_import`，先阅读其 schema 与存储范围。
本地 CLI/MCP 脚本库和 Chrome 扩展存储彼此独立；导入本地库不等于安装到当前 Chrome。
不要为了安装 Chrome 脚本擅自启动隔离浏览器。临时 evaluate 注入也不是持久安装。
