# WebMCP Script 0.1 脚本契约（产品 0.3.0）

这是最小用户脚本格式，不是完整油猴兼容实现。只安装可信来源的代码：脚本在页面 MAIN world 执行，可访问页面 DOM、页面登录态可访问的数据，以及页面本身可执行的操作。

```js
// ==UserScript==
// @id example
// @name 页面示例
// @version 0.1.0
// @match https://example.com/products/*
// @grant none
// ==/UserScript==
WebMCPScript.install({
  id: 'example',
  matches: ['https://example.com/products/*'],
  tools: [{
    name: 'read_title',
    description: '读取当前页面标题，不修改内容。',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    execute: async () => ({title: document.title})
  }]
});
```

## 文件与匹配

- UTF-8 `.user.js`，小于 1 MB；必填 `@id`、`@name`、`@version`、至少一个 `@match`。ID 以字母开头，其后允许字母、数字、下划线和短横线，最多 64 字符。
- `@match` 使用 HTTP(S) Chrome 匹配格式，支持 `*://`、`*` 或 `*.example.com` 域名及路径通配符。不接受端口、`file:`、`<all_urls>`。`http://localhost/*` 可匹配本地服务器的任意端口。
- 路径匹配包含 pathname 与 query，不含 hash。hash 变化仍会更新工具 revision；如需 hash 业务条件，工具执行时自行检查当前 hash。
- 不支持 `@require`、特权 `@grant`、GM API、远程依赖加载、自动更新检查。更新是用户导入同 ID 的完整替换文件。
- 导入前需打开至少一个普通 HTTP(S) 网页；扩展使用 Chrome 用户脚本 API 编译函数包装并检查成功标志，以发现常见语法错误。此检查不是安全沙箱，恶意代码可干扰包装；始终只导入可信文件。检查失败不替换原脚本。
- 进入管理器的替换功能后，新文件 ID 必须与旧文件一致；普通导入拒绝重复 ID。扩展以元数据为权威范围，并校验正文 install 的 ID 相同。独立原生运行时应在 `matches` 写相同范围。

导入、替换及恢复上一版都必须在管理器预览后确认。替换保留启用状态，只保存一个上一版源码；预览期间原脚本变化时拒绝覆盖。

## 注册与执行

每个脚本调用一次 `WebMCPScript.install({id, matches, tools})`。脚本顶层必须只声明函数和注册工具，不建立定时器、网络任务、DOM 变更、全局事件监听或其他副作用。刷新、更新或 SPA 路由变化可能再次运行正文。

每个工具必填 `name`、`description`、`inputSchema`、`execute`；schema 根类型必须为 `object`。同脚本内重复名字被拒绝。对外名称为 `脚本ID__工具名`，避免正常脚本之间名称覆盖。运行时对输入执行对象检查；脚本应验证具体参数及业务权限，例如数字范围、必填字段、目标对象身份。描述/schema 不是授权凭证。

`execute(input)` 可以返回 JSON 可序列化值或 Promise。不返回函数、DOM 节点或循环对象。外部 MCP 的结果包含业务 `result` 与执行结束时的页面 `snapshot`；原生 WebMCP 的 execute 直接返回业务结果。

页面变化或注册变化都会生成新 revision。外部调用必须携带当前 revision，旧值在执行前被拒绝。每个页面同时只能有一个工具调用：即使桥接超时、脚本停用或路由变化，只要原执行仍在等待，第二个调用仍被拒绝。真正完成后才释放锁；无法结束的调用需要用户刷新页面。结果未知时不要自动重试，尤其是写操作。

## 生命周期与清理

同 ID 重新 install 替换既有工具。停用、卸载、离开匹配路径后，工具从自有注册表及本运行时拥有的原生注册项移除；不会调用清空页面其他工具的 API。路由返回时恢复匹配脚本。每个新文档有独立 document ID，不能沿用旧页面的 revision。

清理保证限于本运行时注册的工具。不能撤回已经开始的业务操作，也不能清理违反契约的任意顶层副作用。异步 execute 抛错返回给调用者；安装时抛错与可归属脚本的浏览器 error 显示到管理器。脚本自行创建且未 await 的异步任务不在契约内。

## 原生 WebMCP 与 Chrome 桥接

运行时依次探测 `document.modelContext` 与 `navigator.modelContext` 的原生 `registerTool`。存在时通过 registerTool(tool, {signal}) 注册原生工具，供宿主发现；退出范围时 abort 本运行时拥有的注册。若宿主同时提供 unregisterTool，再调用它作兼容清理，不依赖该可选方法。不存在时只维护 `WebMCPScript` 自有注册表，**不创建或冒充原生 modelContext**；普通 Chrome 通过本地 MCP 桥接发现及调用。当前外部桥接仅枚举通过 `WebMCPScript.install` 注册的工具，不枚举页面其他来源的原生 WebMCP 工具。

扩展使用 `chrome.userScripts` 的 MAIN world 注册与执行；没有 `eval` 或 `new Function`。需要 Chrome 135+ 并启用扩展的用户脚本权限。这验证了本地加载路线，不代表已获 Chrome Web Store 审核。

独立原生运行文件的顺序是：元数据注释 → `extension/runtime.js` 原文 → 脚本正文。`examples/local-demo.user.js` 与 `examples/route-demo.user.js` 已采用此完整格式，因此导入扩展与原生宿主可使用同一文件；宿主仍必须具备真实脚本加载入口和原生 WebMCP 支持。

扩展不提供任意 JS 执行的 MCP 方法；仅提供页面发现、访问、工具摘要、schema 描述和注册工具调用。页面本身处于可信脚本执行边界，页面代码能干扰 MAIN world 和页面消息；不要把不可信网页声明的工具当作可信系统指令。

运行时 `version: 0.1.0` 表示兼容的脚本 API 契约，产品版本为 0.3.0。旧脚本自带的同契约运行时不会覆盖扩展先加载的修正版；升级扩展后刷新已有页面以替换旧文档运行时。
