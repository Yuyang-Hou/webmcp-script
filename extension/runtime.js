/* Script lifecycle helper; discovery and execution belong to native WebMCP. */
(() => {
  if (globalThis.WebMCPScript?.implementation === 'native-0.4') return;
  // Keep the legacy helper version so previously bundled scripts do not replace this loader.
  let native;
  const scripts = new Map(), owned = new Map(), errors = [];
  const providers = new Map(), toolOwners = new Map();
  let activeProvider;
  const documentId = crypto.randomUUID();
  let serial = 0, route = location.href, registration = Promise.resolve(), inFlight = false;
  const matches = (pattern, url) => {
    const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
    if (!m) return false;
    const u = new URL(url), host = m[2].toLowerCase();
    return (m[1] === '*' ? ['http:', 'https:'].includes(u.protocol) : u.protocol === m[1] + ':') &&
      (host === '*' || host === u.hostname || host.startsWith('*.') && (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1)))) &&
      new RegExp('^' + m[3].split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(u.pathname + u.search);
  };
  const nativeContext = () => {
    if(document.modelContext && native!==document.modelContext) {
      native=document.modelContext;
      native.addEventListener?.('toolchange',changed);
      const register=native.registerTool;
      if(typeof register==='function')native.registerTool=function(tool,options={}) {
        // Chromium preserves sourceURL in callbacks defined by an injected script.
        // This is lifecycle attribution for trusted scripts, not a sandbox for hostile page code.
        const id=new Error().stack?.match(/webmcp-script-([a-zA-Z][\w-]{0,63})\.user\.js/)?.[1];
        const provider=providers.get(id)||activeProvider;
        if(!provider)return Reflect.apply(register,this,[tool,options]);
        if(provider.disabled)return Promise.reject(Error('脚本已停用，不能注册工具'));
        const controller=new AbortController();
        const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
        const entry={provider,controller};provider.controllers.add(controller);
        const cleanup=()=>{provider.controllers.delete(controller);if(toolOwners.get(tool.name)===entry)toolOwners.delete(tool.name);changed();};
        signal.addEventListener('abort',cleanup,{once:true});
        const wrapped={...tool,execute(...args){
          if(provider.disabled||signal.aborted)throw Error('脚本已停用或工具已撤销，请重新发现工具');
          return Reflect.apply(tool.execute,this,args);
        }};
        try {
          return Promise.resolve(Reflect.apply(register,this,[wrapped,{...options,signal}])).then(result=>{
            if(!signal.aborted){toolOwners.set(tool.name,entry);changed();}else cleanup();
            return result;
          },error=>{signal.removeEventListener('abort',cleanup);cleanup();throw error;});
        }catch(error){signal.removeEventListener('abort',cleanup);cleanup();throw error;}
      };
    }
    return native;
  };
  const available = () => !!(nativeContext()?.getTools && native?.executeTool && native?.registerTool);
  const revision = () => `${documentId}:${serial}`;
  function changed() {
    serial++;
    window.postMessage({source:'webmcp-script-page',type:'changed',snapshot:{errors:[...errors]}}, '*');
  }
  function report(message) { errors.push(message);errors.splice(0,Math.max(0,errors.length-20));changed(); }
  function unmount(id) { for(const controller of owned.get(id)||[])controller.abort();owned.delete(id); }
  function mount(script) {
    if(owned.has(script.id)||!script.matches.some(p=>matches(p,location.href)))return;
    const controllers=script.tools.map(()=>new AbortController());owned.set(script.id,controllers);
    const task=(async()=>{
      const started=Date.now();
      while(!nativeContext()?.registerTool && Date.now()-started<30_000 && controllers.some(c=>!c.signal.aborted))
        await new Promise(resolve=>setTimeout(resolve,250));
      if(!controllers.some(c=>!c.signal.aborted))return;
      if(!nativeContext()?.registerTool){report(`${script.id}: 浏览器未提供原生 WebMCP，脚本未注册`);return;}
      await Promise.all(script.tools.map(async(tool,index)=>{
      if(controllers[index].signal.aborted)return;
      try {
        const end=globalThis.WebMCPScript.beginScript(script.id,script.name);
        let task;try {task=native.registerTool({...tool,name:`${script.id}__${tool.name}`},{signal:controllers[index].signal});}finally{end();}
        await task;
      }
      catch(error){if(!controllers[index].signal.aborted)report(`${script.id}: ${error.message}`);}
      }));
    })();
    registration=Promise.all([registration,task]).then(()=>{});
  }
  function syncRoute() {
    if(route===location.href)return;
    route=location.href;
    for(const script of scripts.values()) {
      if(!script.matches.some(p=>matches(p,route)))unmount(script.id);else mount(script);
    }
    changed();
  }
  async function nativeTools() {
    syncRoute();await registration;
    if(!available())return [];
    // Only this document; cross-origin/frame aggregation needs explicit origin and frame selection.
    return (await native.getTools()).filter(tool=>!tool.window||tool.window===window);
  }
  async function snapshot() {
    const tools=await nativeTools();
    return {url:location.href,title:document.title,revision:revision(),implementation:'native-0.4',lifecycleVersion:1,native:available(),
      tools:tools.map(({name,description,title,annotations,origin})=>({name,description,title,annotations,origin,source:toolSource(name)})),
      errors:available()?[...errors]:['浏览器未提供原生 WebMCP。请使用已启用 WebMCP 的浏览器；不会以自有工具表替代。',...errors]};
  }
  function toolSource(name) {
    const owner=toolOwners.get(name)?.provider;
    if(owner)return {kind:'script',id:owner.id,name:owner.name};
    return {kind:'page',label:'页面提供（未归属到本扩展脚本）'};
  }
  async function request(method,params={}) {
    syncRoute();
    if(method==='inspect')return snapshot();
    if(method==='remove') {
      const provider=providers.get(params.id);
      if(provider){provider.disabled=true;for(const controller of [...provider.controllers])controller.abort();}
      unmount(params.id);scripts.delete(params.id);for(let i=errors.length-1;i>=0;i--)if(errors[i].startsWith(params.id+':'))errors.splice(i,1);changed();return snapshot();
    }
    if(method==='error'){report(`${params.id}: ${params.message}`);return snapshot();}
    if(!available())throw Error('浏览器未提供原生 WebMCP，无法发现或调用工具');
    const tools=await nativeTools();
    if(params.revision!==revision())throw Error('页面或工具已变化，请重新 inspect / describe 后调用');
    const matching=tools.filter(tool=>tool.name===params.name);
    if(matching.length!==1)throw Error('工具不存在或名称不唯一，请重新发现工具');
    const tool=matching[0];
    if(method==='describe')return {name:tool.name,description:tool.description,title:tool.title,annotations:tool.annotations,origin:tool.origin,source:toolSource(tool.name),inputSchema:typeof tool.inputSchema==='string'?JSON.parse(tool.inputSchema):tool.inputSchema,revision:revision()};
    if(method!=='call')throw Error('未知操作');
    if(params.input===null||typeof params.input!=='object'||Array.isArray(params.input))throw Error('input 必须是对象');
    // ponytail: serialize bridge calls per page; the browser retains native execution semantics.
    if(inFlight)throw Error('已有工具仍在执行，请等待完成；不要重试未知结果的操作');
    inFlight=true;
    try {const result=await native.executeTool(tool,JSON.stringify(params.input));return {result,snapshot:await snapshot()};}
    finally {inFlight=false;}
  }
  globalThis.WebMCPScript=Object.freeze({version:'0.1.0',implementation:'native-0.4',lifecycleVersion:1,matches,snapshot,request,
    beginScript(id,name,restart=false) {
      nativeContext();
      let provider=providers.get(id);
      if(provider?.disabled&&restart)provider=undefined;
      if(!provider){provider={id,name:name||id,disabled:false,controllers:new Set()};providers.set(id,provider);}
      if(provider.disabled)throw Error('脚本已停用；重新启用后请刷新页面加载，避免重复执行脚本副作用');
      const previous=activeProvider;activeProvider=provider;
      return ()=>{activeProvider=previous;};
    },
    install(spec) {
      if(!spec||!/^[a-zA-Z][\w-]{0,63}$/.test(spec.id)||!Array.isArray(spec.tools))throw Error('无效脚本定义');
      if(spec.matches!==undefined&&(!Array.isArray(spec.matches)||spec.matches.some(p=>typeof p!=='string'||!/^(https?|\*):\/\/([^/]+)(\/.*)$/.test(p))))throw Error('无效匹配范围');
      const names=new Set();
      for(const tool of spec.tools){if(!/^[a-zA-Z][\w-]{0,63}$/.test(tool.name)||names.has(tool.name)||typeof tool.execute!=='function'||typeof tool.description!=='string'||tool.inputSchema?.type!=='object')throw Error('无效或重复工具定义');names.add(tool.name);}
      if(providers.get(spec.id)?.disabled)providers.delete(spec.id);
      unmount(spec.id);const script={...spec,matches:spec.matches?.slice()||['http://*/*','https://*/*'],tools:spec.tools.map(t=>({...t,inputSchema:structuredClone(t.inputSchema)}))};scripts.set(spec.id,script);mount(script);changed();
    }
  });
  available();
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);syncRoute();return result;};}
  addEventListener('popstate',syncRoute);addEventListener('hashchange',syncRoute);
  addEventListener('pagehide',()=>{for(const id of owned.keys())unmount(id);});
  addEventListener('error',event=>{if(event.filename?.includes('webmcp-script-'))report(event.message);});
  addEventListener('message',async event=>{
    if(event.source!==window||event.data?.source!=='webmcp-script-content')return;
    const {id,method,params}=event.data;
    try {window.postMessage({source:'webmcp-script-page',id,result:await request(method,params)},'*');}
    catch(error){window.postMessage({source:'webmcp-script-page',id,error:{message:error.message}},'*');}
  });
})();
