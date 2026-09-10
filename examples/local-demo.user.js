// ==UserScript==
// @id local-demo
// @name 本地演示工具
// @version 0.1.0
// @match http://127.0.0.1/*
// @match http://localhost/*
// @grant none
// ==/UserScript==
/* WebMCP Script runtime 0.1.1; prepend this file for standalone native use. */
(() => {
  // Compatible bundled scripts share this API version; refresh documents after extension upgrades.
  if (globalThis.WebMCPScript?.version === '0.1.0') return;
  const scripts = new Map(), nativeOwned = new Map(), errors = [];
  const documentId = crypto.randomUUID();
  // ponytail: serialize calls per page; use per-resource locks only when safe parallel tools are needed.
  let serial = 0, route = location.href, inFlight = false;
  const native = document.modelContext?.registerTool ? document.modelContext : navigator.modelContext;
  const matches = (pattern, url) => {
    const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
    if (!m) return false;
    const u = new URL(url), host = m[2].toLowerCase();
    return (m[1] === '*' ? ['http:', 'https:'].includes(u.protocol) : u.protocol === m[1] + ':') &&
      (host === '*' || host === u.hostname || host.startsWith('*.') && (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1)))) &&
      new RegExp('^' + m[3].split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(u.pathname + u.search);
  };
  const revision = () => `${documentId}:${serial}`;
  const active = () => [...scripts.values()].filter(s => !s.matches || s.matches.some(p => matches(p, location.href)));
  const tools = () => active().flatMap(s => s.tools.map(t => ({...t, name: `${s.id}__${t.name}`})));
  const snapshot = () => ({url: location.href, title: document.title, revision: revision(), native: !!native?.registerTool, tools: tools().map(({name, description}) => ({name, description})), errors: [...errors]});
  function changed() {
    serial++;
    for (const [name, controller] of nativeOwned) {
      controller.abort();
      if (typeof native.unregisterTool === 'function') { try { native.unregisterTool(name); } catch (e) { errors.push(String(e)); } }
    }
    nativeOwned.clear();
    if (native?.registerTool) for (const t of tools()) {
      const rev = revision(), controller = new AbortController();
      try {
        nativeOwned.set(t.name, controller);
        const registered = native.registerTool({...t, execute: async input => (await request('call', {name:t.name, revision:rev, input})).result}, {signal:controller.signal});
        Promise.resolve(registered).catch(error => {
          if (controller.signal.aborted) return;
          errors.push(`${t.name}: ${error.message}`);
          window.postMessage({source:'webmcp-script-page', type:'changed', snapshot:snapshot()}, '*');
        });
      } catch (e) { errors.push(`${t.name}: ${e.message}`); }
    }
    errors.splice(0, Math.max(0, errors.length - 20));
    window.postMessage({source:'webmcp-script-page', type:'changed', snapshot:snapshot()}, '*');
  }
  function syncRoute() { if (route !== location.href) { route = location.href; changed(); } }
  async function request(method, params = {}) {
    syncRoute();
    if (method === 'inspect') return snapshot();
    if (method === 'remove') { scripts.delete(params.id); for(let i=errors.length-1;i>=0;i--) if(errors[i].startsWith(params.id+':')) errors.splice(i,1); changed(); return snapshot(); }
    if (method === 'error') { errors.push(`${params.id}: ${params.message}`); changed(); return snapshot(); }
    if (params.revision !== revision()) throw Error('页面或工具已变化，请重新 inspect / describe 后调用');
    const tool = tools().find(t => t.name === params.name);
    if (!tool) throw Error('工具已停用或不存在');
    if (method === 'describe') return {name:tool.name, description:tool.description, inputSchema:tool.inputSchema, revision:revision()};
    if (method !== 'call') throw Error('未知操作');
    if (params.input === null || typeof params.input !== 'object' || Array.isArray(params.input)) throw Error('input 必须是对象');
    if (inFlight) throw Error('已有工具仍在执行，请等待完成；不要重试未知结果的操作');
    inFlight = true;
    try { const result = await tool.execute(params.input); syncRoute(); return {result, snapshot:snapshot()}; }
    finally { inFlight = false; }
  }
  globalThis.WebMCPScript = Object.freeze({version:'0.1.0', matches, snapshot, request,
    install(spec) {
      if (!spec || !/^[a-zA-Z][\w-]{0,63}$/.test(spec.id) || !Array.isArray(spec.tools)) throw Error('无效脚本定义');
      if (spec.matches !== undefined && (!Array.isArray(spec.matches) || spec.matches.some(p => typeof p !== 'string' || !/^(https?|\*):\/\/([^/]+)(\/.*)$/.test(p)))) throw Error('无效匹配范围');
      const names = new Set();
      const otherNames = new Set([...scripts.values()].filter(s => s.id !== spec.id).flatMap(s => s.tools.map(t => `${s.id}__${t.name}`)));
      for (const t of spec.tools) {
        if (!/^[a-zA-Z][\w-]{0,63}$/.test(t.name) || names.has(t.name) || typeof t.execute !== 'function' || typeof t.description !== 'string' || t.inputSchema?.type !== 'object') throw Error('无效或重复工具定义');
        if (otherNames.has(`${spec.id}__${t.name}`)) throw Error('跨脚本工具名称冲突');
        names.add(t.name);
      }
      scripts.set(spec.id, {...spec, matches:spec.matches?.slice(), tools:spec.tools.map(t => ({...t,inputSchema:structuredClone(t.inputSchema)}))}); changed();
    }
  });
  for (const method of ['pushState','replaceState']) {
    const original = history[method];
    history[method] = function(...args) { const result = original.apply(this,args); syncRoute(); return result; };
  }
  addEventListener('error', event => { if (event.filename?.includes('webmcp-script-')) { errors.push(event.message); changed(); } });
  addEventListener('popstate', syncRoute); addEventListener('hashchange', syncRoute);
  addEventListener('message', async event => {
    if (event.source !== window || event.data?.source !== 'webmcp-script-content') return;
    const {id, method, params} = event.data;
    try { window.postMessage({source:'webmcp-script-page', id, result:await request(method,params)}, '*'); }
    catch(e) { window.postMessage({source:'webmcp-script-page', id, error:{message:e.message}}, '*'); }
  });
})();


WebMCPScript.install({
  id: 'local-demo',
  matches: ['http://127.0.0.1/*','http://localhost/*'],
  tools: [{
    name: 'read_page',
    description: '读取当前本地演示页面的标题、路由和文字，不修改页面。',
    inputSchema: {type:'object', properties:{}, additionalProperties:false},
    execute: async () => ({title:document.title, url:location.href, text:document.body.innerText.slice(0,4000)})
  }, {
    name: 'sum',
    description: '计算两个数字之和，仅用于验证独立脚本调用。',
    inputSchema: {type:'object', properties:{a:{type:'number'}, b:{type:'number'}},required:['a','b'],additionalProperties:false},
    execute: async ({a,b}) => {if(!Number.isFinite(a)||!Number.isFinite(b)) throw Error('a、b 必须为有限数字');return {sum:a+b};}
  }]
});
