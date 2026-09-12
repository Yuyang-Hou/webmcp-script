# 安装与首次使用

0.4.0-beta.2 提供预构建 ZIP。加载扩展不需要终端；连接 AI 时需要本机 Node.js 22+。没有商店一键安装或自动更新。

## 1. 准备浏览器

已实测 Chromium 153，并开启 WebMCPTesting。版本号本身不能保证接口可用。

打开 `chrome://flags/#enable-webmcp-testing`，设为 Enabled，保存页面工作后重启浏览器。见 [Chrome 官方文档](https://developer.chrome.com/docs/ai/webmcp/)。找不到开关或显示不支持时，请记录浏览器完整版本反馈，不必反复重装扩展。网站的安全上下文、origin isolation 和 Permissions Policy 也可能限制原生接口。

## 2. 下载与加载

从 [公测发布页](https://github.com/Yuyang-Hou/webmcp-script/releases/tag/v0.4.0-beta.2) 下载 **webmcp-script-0.4.0-beta.2.zip**，不是附带的 Source code 包。解压到固定目录，保留所有文件，无需 pnpm、npm install 或构建。

打开 `chrome://extensions`，开启开发者模式 → 加载已解压的扩展程序 → 选择解压目录里的 **extension**。进入扩展详情，开启“允许用户脚本”。Chrome 138+ 使用每个扩展单独的开关，见 [官方说明](https://developer.chrome.com/docs/extensions/reference/api/userScripts)。

将绿色恐龙头固定到工具栏。打开普通网站后点击图标，可以查看“网页工具”和“本页脚本”。管理面板是扩展自己的页面，不需要另起服务。

包内还有 bridge（已打包 MCP）、setup.mjs（生成本机配置）、examples（脚本示例）和 demo.mjs（本地演示）。不要只保留 extension 后删除其余文件。

## 3. 连接 AI

1. 扩展 → 管理面板 → 连接 → 复制连接说明。
2. 发给支持本机 stdio MCP 的 AI 客户端。它会检查 Node.js 22+，找到解压目录，运行 `node setup.mjs`，保留其他服务并添加或重新加载 webmcp-script。该命令只输出配置，不修改客户端、不启动服务。
3. AI 调用 connection_info 后，将完整 JSON 连接码粘贴到扩展。此工具不需要先连好扩展。
4. 请 AI 调用 pages。能列出页面才算实际连接验证完成；扩展连接状态仅代表它连到了本机服务。

若 AI 无权配置客户端，运行 `node setup.mjs` 并将输出 JSON 添加到客户端 MCP 设置。不要照抄别人的路径。Node.js 未内置在包中；纯网页或远程客户端若不能启动本机进程，不适用此配置。

## 4. 用本地示例验收

在解压目录运行 `node demo.mjs`，保持终端运行，浏览器打开 `http://127.0.0.1:17892`（不是 /native）。

管理面板 → 新建脚本 → 粘贴 examples/local-demo.user.js 完整内容 → 保存 → 检查范围只有 localhost / 127.0.0.1 后确认。刷新示例页面。

请 AI 发现页面工具，获取最新 revision/schema，再调用 local-demo__sum，输入 a: 2、b: 3，预期结果为 5。该示例不操作业务系统。/native 是网页自身加载脚本的对照页，不能证明扩展安装成功。结束时可停用脚本，Ctrl+C 关闭 demo。

## 常见问题

连接页展开“连接检查”，按需检查用户脚本权限、本机服务和网页原生接口。它不执行网站工具，也不代替 AI 调用 pages。

| 现象 | 处理 |
|---|---|
| 没有工具 | 区分“0 个工具”和“不支持”；确认网页内置工具或脚本匹配 URL |
| 无法保存 / userScripts 权限错误 | 开启允许用户脚本，并保持至少一个普通 HTTP(S) 页面已打开 |
| 不知道如何配置 MCP | 复制连接说明交给 AI，或运行 node setup.mjs |
| 没有 connection_info | 重新连接已有 MCP 服务，避免重复添加 |
| 端口占用或配对失败 | 关闭旧版本 MCP 连接后重试；使用包含端口的新连接码 |
| 更新后页面仍是旧工具 | 保存页面工作后刷新；仅重载扩展不能替换页面运行时 |
| 停用清理失败 | 按页面提示刷新，不把尚未清理的页面当成停用成功 |

## 升级与退出公测

升级前将重要脚本另存为 .user.js，关闭客户端的旧 MCP 服务。将新版解压到临时目录，核对版本后，用新版产品文件替换原安装目录的同名文件，**保留原 .local/ 和扩展加载路径**。重载原扩展、重新连接 MCP，保存页面工作后刷新网页。不要卸载再装来升级。

从 beta.1 源码安装升级：先将预构建包内产品文件复制到原项目根目录，再将新 extension 内容复制到原 dist/extension；Chrome 继续加载原来的 dist/extension。保留 .local/，运行 node setup.mjs 核对路径。可将本段交给 AI 协助，操作前备份脚本。

更换目录后须重新运行 setup.mjs 并更新客户端路径；Chrome 可能将另一加载路径视为新扩展，脚本存储不会自动迁移。

尚无完整导出或跨设备同步。卸载扩展会丢失其中的脚本；配对信息与可选 CLI 脚本库保存在产品目录 .local/。退出公测时先保存脚本，移除 MCP 配置、卸载扩展，再删除不需要的目录。不要上传 .local/。

反馈请附产品版本、系统、浏览器完整版本、MCP 客户端和脱敏步骤：[提交问题](https://github.com/Yuyang-Hou/webmcp-script/issues/new/choose)。
