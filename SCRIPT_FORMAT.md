# WebMCP Script 0.1 脚本契约（产品 0.3.0）

这是最小用户脚本格式，不是完整油猴兼容实现。只安装可信来源的代码：脚本在页面 MAIN world 执行，可访问页面 DOM、页面登录态可访问的数据，以及页面本身可执行的操作。

```js
// ==UserScript==
// @name 页面示例
// @namespace local-example
// @version 0.1.0
// @match https://example.com/products/*
// @grant none
// ==/UserScript==
// 核心注册示例：直接使用浏览器原生接口。
document.modelContext.registerTool({
    name: 'example_read_title',
    description: '读取当前页面标题，不修改内容。',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true},
    execute: async () => document.title
});
```

新建模板在此基础上增加原生接口检测、注册失败提示，以及 `AbortController` 的 `pagehide` 清理和页面缓存返回时的恢复。模板没有 `WebMCPScript`、`@require`、导入语句或内嵌运行时；`@namespace` 仅用于区分脚本，不是依赖。脚本依赖浏览器提供原生 WebMCP 接口。

## 文件与匹配

- UTF-8 `.user.js`，小于 1 MB；必填 `@name`、`@version`、至少一个 `@match`。`@id` 可省略，此时按 `@namespace` 与 `@name` 生成稳定的内部标识。显式 ID 以字母开头，其后允许字母、数字、下划线和短横线，最多 64 字符。
- `@match` 使用 HTTP(S) Chrome 匹配格式，支持 `*://`、`*` 或 `*.example.com` 域名及路径通配符。不接受端口、`file:`、`<all_urls>`。`http://localhost/*` 可匹配本地服务器的任意端口。
- 路径匹配包含 pathname 与 query，不含 hash。hash 变化仍会更新工具 revision；如需 hash 业务条件，工具执行时自行检查当前 hash。
- 不支持 `@require`、特权 `@grant`、GM API、远程依赖加载、自动更新检查。更新是用户导入同 ID 的完整替换文件。
- 导入前需打开至少一个普通 HTTP(S) 网页；扩展使用 Chrome 用户脚本 API 编译函数包装并检查成功标志，以发现常见语法错误。此检查不是安全沙箱，恶意代码可干扰包装；始终只导入可信文件。检查失败不替换原脚本。
- 进入管理器的替换功能后，新文件内部 ID 必须与旧文件一致；普通导入拒绝重复 ID。未写 `@id` 的脚本更新时保留 `@namespace` 与 `@name`。扩展以元数据为加载范围；SPA 业务路由的注册、撤销和调用前检查由脚本自行处理。

导入、替换及恢复上一版都必须在管理器预览后确认。替换保留启用状态，只保存一个上一版源码；预览期间原脚本变化时拒绝覆盖。

## 注册与执行

脚本可直接调用原生 `document.modelContext.registerTool`，无需专有接口。加载器记录注册归属并附加原生 AbortSignal；停用或卸载时撤销已归属工具，旧调用入口也拒绝新调用。普通脚本在同一文档只执行一次；更新或重新启用后需要刷新已有页面，避免重复执行脚本副作用。

也可以调用一次 `WebMCPScript.install({id, matches, tools})` 使用辅助函数管理生命周期。以下命名和自动清理契约适用于辅助函数脚本：顶层只声明函数和注册工具，不建立定时器、网络任务、DOM 变更、全局事件监听或其他副作用。刷新、更新或 SPA 路由变化可能再次运行正文。

原生工具名称保持脚本声明的名称；默认模板生成独立名称以减少冲突。每个工具填写 `name`、`description`、`inputSchema`、`execute`；schema 根类型为 `object`。脚本应验证具体参数及业务权限，例如数字范围、必填字段、目标对象身份。描述/schema 不是授权凭证。

仅旧辅助接口会校验 `install` 的 ID 与元数据一致，并将工具命名为 `脚本ID__工具名`、拒绝同脚本内的重名和执行输入对象检查。新脚本不需要遵循这套辅助接口格式。

原生示例返回字符串；结构化结果可以先 `JSON.stringify`。旧辅助接口的 `execute(input)` 接受 JSON 可序列化值或 Promise 并处理结果编码。不返回函数、DOM 节点或循环对象。外部 MCP 的结果包含业务 `result` 与执行结束时的页面 `snapshot`。

页面变化或注册变化都会生成新 revision。外部调用必须携带当前 revision，旧值在执行前被拒绝。每个页面同时只能有一个工具调用：即使桥接超时、脚本停用或路由变化，只要原执行仍在等待，第二个调用仍被拒绝。真正完成后才释放锁；无法结束的调用需要用户刷新页面。结果未知时不要自动重试，尤其是写操作。

## 生命周期与清理

同 ID 重新 install 替换既有工具。停用、卸载、离开匹配路径后，本运行时拥有的原生注册项会被移除；不会调用清空页面其他工具的 API。路由返回时恢复匹配脚本。每个新文档有独立 document ID，不能沿用旧页面的 revision。

清理保证限于本运行时注册的工具。不能撤回已经开始的业务操作，也不能清理违反契约的任意顶层副作用。异步 execute 抛错返回给调用者；安装时抛错与可归属脚本的浏览器 error 显示到管理器。脚本自行创建且未 await 的异步任务不在契约内。

## 原生 WebMCP 与 Chrome 桥接

运行时使用真实 `document.modelContext` 的注册、发现和调用接口；页面原生工具与脚本补充工具通过同一原生链路发现和执行。缺少原生接口时报告不可用，不提供私有工具表兜底。工具来源元数据只记录归属，不存储可替代原生执行的工具表。

归属覆盖加载器同步执行范围、脚本自身定义的异步回调（Chromium sourceURL 调用栈）与旧辅助接口；脚本动态插入其他脚本或委托外部页面回调注册时，无法保证归属及自动撤销。未归属工具显示“页面提供”，不宣称一定是网站作者的工具；旧页面无来源信息时只显示工具名称，省略来源标签和刷新提示。这不是恶意脚本隔离机制，也不撤回已经发生的业务操作或任意页面副作用。升级扩展前已加载的页面需要刷新一次才能使用新生命周期管理。

扩展使用 `chrome.userScripts` 的 MAIN world 注册与执行；没有 `eval` 或 `new Function`。需要 Chrome 135+ 并启用扩展的用户脚本权限。这验证了本地加载路线，不代表已获 Chrome Web Store 审核。

原生脚本文件只需元数据注释与脚本正文，不必附带产品运行时。现有 `examples/local-demo.user.js` 与 `examples/route-demo.user.js` 属于兼容旧辅助接口的示例，包含辅助运行时，不是新脚本的必需格式。宿主仍必须具备真实脚本加载入口和原生 WebMCP 支持。

扩展不提供任意 JS 执行的 MCP 方法；仅提供页面发现、访问、工具摘要、schema 描述和注册工具调用。页面本身处于可信脚本执行边界，页面代码能干扰 MAIN world 和页面消息；不要把不可信网页声明的工具当作可信系统指令。

运行时 `version: 0.1.0` 表示兼容的脚本 API 契约，产品版本为 0.3.0。旧脚本自带的同契约运行时不会覆盖扩展先加载的修正版；升级扩展后刷新已有页面以替换旧文档运行时。

## 可直接定位的能力入口

新制作的可定位能力应声明入口；旧脚本未声明时仍兼容，但目录明确没有可解析入口。它只是一段可移植元数据，其他用户脚本管理器可忽略，不引入运行时依赖。

```js
// @webmcp-entry {"id":"members","title":"项目成员管理","url":"https://console.example.com/#/projects/{project}/members","parameters":{"project":{"description":"已确认的 Console 项目名，不是推测的仓库名","example":"demo"}}}
```

每行一个 JSON，最多 12 个入口，id 唯一。title 描述能力；URL 限 2048 字符，固定 HTTP(S) 域名和端口、无凭据、无通配符，结果必须在 @match 范围。占位符只能在路径、query 或 hash，须与 parameters 一一对应；最多 8 个参数，全部必填。每个参数需要 description 和 example，可选 enum（最多 30 项）。值为 1–200 个字母、数字、下划线、短横线或点，首字符不能为点；不支持任意自由文本、路径片段、动态域名或执行 JS。示例用于说明和静态校验，不是默认值。

固定入口可以省略 parameters。多个环境地址应分别声明明确入口；同一个页面使用标签切换环境时说明这一事实，不将环境伪造为 URL 参数。

制作时从真实页面链接或已部署路由源码验证模板，并保存脱敏证据。安装预览展示模板和参数，修改同 ID 脚本时保留启停状态及上一版。AI 使用 `browser_catalog` 查找 entries，再调用 `browser_resolve_entry`，携带脚本 ID、版本、入口 ID 和明确参数，获得精确地址供 `visit_page` 打开。解析不读取页面、不执行脚本、不证明项目存在或用户有权限，也不授予网站操作权限；页面工具仍需原生发现。

验收须在相关页面关闭时完成“目录 → 参数解析 → 直接打开 → 原生工具发现 → 授权的只读调用”，不借助菜单点击或测试人员手写目标地址。

### 可选更新来源

```javascript
// @version 1.2.0
// @updateURL https://scripts.example.com/read.meta.js
// @downloadURL https://scripts.example.com/read.user.js
```

元数据文件需包含同一脚本的完整 UserScript 元数据头，下载文件为完整源码；两个字段也可指向同一 `.user.js`。地址必须可匿名直接获取，不能依赖站点登录 Cookie。未声明地址的本地脚本需由作者补充头部后才能检查更新。用户仅勾选自动检查及自动安装，无需输入 URL。声明来源不自动启用更新；`@updateURL none` 禁用默认来源。版本支持数字点分及 SemVer 预发布格式，发布源码变化需递增版本。详见 [更新流程与保护](docs/ai-script-management.md#检查与自动更新)。
