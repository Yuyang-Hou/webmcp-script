import {prepareImport} from './metadata.js';
let socket, connecting = false, bridgeStatus = '未配对', lastError = '', mutation = Promise.resolve();
const runtimeCode = fetch(chrome.runtime.getURL('runtime.js')).then(r => r.text());
const settings = async () => ({scripts:[], token:'', port:17891, ...await chrome.storage.local.get(['scripts','token','port'])});
const notify = () => { if (socket?.readyState === 1) socket.send(JSON.stringify({type:'changed'})); };
function api() {
  if (!chrome.userScripts?.execute) throw Error('请在 chrome://extensions 的 WebMCP Script 详情中开启“允许用户脚本”（旧版 Chrome 开启开发者模式）');
  return chrome.userScripts;
}
async function execute(injection) {
  const results = await api().execute(injection);
  const error = results.find(result => result.error)?.error;
  if (error) throw Error(error);
  return results;
}
async function checkSyntax(script) {
  const tab=(await chrome.tabs.query({})).find(tab=>/^https?:/.test(tab.url||''));
  if(!tab) throw Error('请先打开一个普通 HTTP(S) 网页，再导入脚本；原有脚本已保留');
  const results=await execute({target:{tabId:tab.id},world:'MAIN',js:[{code:`(() => {\n${script.source}\n}); true;`}]});
  if(!results.some(result=>result.result===true)) throw Error('脚本语法检查失败，原有脚本已保留');
}
async function sourceFor(script) {
  return `${await runtimeCode}\n(() => { let installed = false; const WebMCPScript = {...globalThis.WebMCPScript, install(spec) { if(spec.id !== ${JSON.stringify(script.id)}) throw Error('脚本 ID 与元数据不一致'); globalThis.WebMCPScript.install({...spec,matches:${JSON.stringify(script.matches)}}); installed = true; }}; try {\n${script.source}\nif (!installed) throw Error('脚本没有调用 WebMCPScript.install');\n} catch (e) { WebMCPScript.request('error', {id:${JSON.stringify(script.id)},message:e.message}); } })();\n//# sourceURL=webmcp-script-${script.id}.user.js`;
}
async function page(pageId, method, params={}) {
  if (!Number.isInteger(Number(pageId))) throw Error('无效 pageId');
  const data = await chrome.tabs.sendMessage(Number(pageId), {type:'page',method,params}, {frameId:0});
  if (data.error) throw Error(data.error.message);
  return {...data.result, pageId:Number(pageId)};
}
async function inject(tab, scripts) {
  if (!/^https?:/.test(tab.url || '')) return;
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  await execute({target:{tabId:tab.id},world:'MAIN',js:[{code:await runtimeCode}]});
  for (const script of scripts) {
    // Match the exact URL at execution time inside MAIN world as tabs may navigate meanwhile.
    const code = `if (${JSON.stringify(script.matches)}.some(p => WebMCPScript.matches(p, location.href))) {\n${await sourceFor(script)}\n}`;
    if (script.enabled) await execute({target:{tabId:tab.id},world:'MAIN',js:[{code}]});
  }
}
async function apply(scripts, removed=[]) {
  const user = api();
  const previous = await user.getScripts();
  lastError = '';
  await user.unregister();
  try { await user.register([{id:'webmcp-runtime',matches:['http://*/*','https://*/*'],js:[{code:await runtimeCode}],world:'MAIN',runAt:'document_start'},
    ...await Promise.all(scripts.filter(s=>s.enabled).map(async s=>({id:s.id,matches:s.matches,js:[{code:await sourceFor(s)}],world:'MAIN',runAt:'document_idle'})))]); } catch (error) {
    await user.unregister();
    if (previous.length) await user.register(previous);
    throw error;
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter(t=>/^https?:/.test(t.url||'')).map(async tab=> {
    try {
      for (const id of removed) await page(tab.id,'remove',{id}).catch(()=>{});
      await inject(tab,scripts);
    } catch(e) { lastError = `${tab.url}: ${e.message}`; }
  }));
  notify();
}
async function dispatch(method,params={}) {
  if (method === 'pages') {
    const tabs = (await chrome.tabs.query({})).filter(t=>/^https?:/.test(t.url||''));
    return {pages:await Promise.all(tabs.map(async t=> {try {return {id:t.id,...await page(t.id,'inspect')};} catch(e) {return {id:t.id,url:t.url,title:t.title,tools:[],error:e.message};}}))};
  }
  if (method === 'visit') {
    const u = new URL(params.url);
    if (!['http:','https:'].includes(u.protocol)) throw Error('visit 只接受 HTTP(S) URL');
    const tab = await chrome.tabs.create({url:u.href});
    for (let n=0;n<40;n++) { await new Promise(r=>setTimeout(r,250)); const t=await chrome.tabs.get(tab.id); if(t.status==='complete') { mutation=mutation.catch(()=>{}).then(async()=>inject(t,(await settings()).scripts)); await mutation; return page(t.id,'inspect'); } }
    throw Error('新页面加载超时，请用 pages 获取页面状态');
  }
  if (!['inspect','describe','call'].includes(method)) throw Error('不支持的方法');
  return page(params.pageId,method,params);
}
async function connect() {
  if (connecting || socket?.readyState === 0 || socket?.readyState === 1) return;
  connecting=true;
  const {token,port:storedPort}=await settings();
  const port=Number(storedPort);
  if(!Number.isInteger(port)||port<1||port>65535) {bridgeStatus='本地端口无效，请重新配对';connecting=false;return;}
  if (!token) {bridgeStatus='未配对';connecting=false;return;}
  bridgeStatus='连接中…';
  const ws=new WebSocket(`ws://127.0.0.1:${port}/extension?token=${encodeURIComponent(token)}`);
  socket=ws;
  ws.onopen=()=>{if(socket!==ws)return;connecting=false;bridgeStatus='已连接';ws.send(JSON.stringify({type:'hello',version:'0.3.0'}));};
  ws.onclose=()=>{if(socket!==ws)return;connecting=false;bridgeStatus='连接断开，自动重连中';setTimeout(connect,3000);};
  ws.onerror=()=>{if(socket===ws)bridgeStatus='本地桥接连接失败';};
  ws.onmessage=async event=> {
    let message;
    try { message=JSON.parse(event.data); if(message.type==='ping') {if(ws.readyState===1)ws.send(JSON.stringify({type:'pong'}));return;} if(!message.id || !message.method) return;
      const result=await dispatch(message.method,message.params); if(ws.readyState===1)ws.send(JSON.stringify({id:message.id,result}));
    } catch(e) { if(ws.readyState===1 && message?.id) ws.send(JSON.stringify({id:message.id,error:{message:e.message}})); }
  };
}
chrome.alarms.create('reconnect',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(connect);
chrome.tabs.onRemoved.addListener(notify);
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url || change.status==='complete') notify();});
chrome.webNavigation.onHistoryStateUpdated.addListener(async details=>{
  if(details.frameId!==0) return;
  mutation=mutation.catch(()=>{}).then(async()=>{
    try { await inject(await chrome.tabs.get(details.tabId),(await settings()).scripts); } catch(e) {lastError=e.message;}
    notify();
  });
  await mutation;
});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='changed') {if(sender.tab && message.errors?.length) lastError=String(message.errors.at(-1));notify();return;}
  if(!sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const action=async()=>{
    if(message.type==='status') {let available=true;try {await api().getScripts();} catch(e) {available=false;lastError=e.message;} return {...await settings(),bridgeStatus,lastError,userScriptsAvailable:available};}
    if(message.type==='pair') {const port=Number(message.port??17891);if(!Number.isInteger(port)||port<1||port>65535)throw Error('本地端口须为 1–65535 的整数');await chrome.storage.local.set({token:message.token.trim(),port});socket?.close();socket=undefined;connecting=false;await connect();return {ok:true};}
    if(message.type==='retry') {const state=await settings();await apply(state.scripts);await connect();return {ok:true};}
    const state=await settings(); let scripts=state.scripts, removed=[];
    if(message.type==='import') {
      const script=prepareImport(message.source,scripts,message.replace,message.expectedSource,message.expectedEnabled), old=scripts.find(s=>s.id===script.id);
      await checkSyntax(script);
      if(old) removed.push(old.id);
      scripts=[...scripts.filter(s=>s.id!==script.id),script];
    } else if(message.type==='toggle') { removed=[message.id];scripts=scripts.map(s=>s.id===message.id?{...s,enabled:!!message.enabled}:s); }
    else if(message.type==='remove') {removed=[message.id];scripts=scripts.filter(s=>s.id!==message.id);}
    else throw Error('未知管理操作');
    await apply(scripts,removed);
    try { await chrome.storage.local.set({scripts}); } catch(error) {
      try { await apply(state.scripts,scripts.map(script=>script.id)); }
      catch(rollbackError) { throw Error(`保存失败：${error.message}；自动恢复未完成：${rollbackError.message}。请重试加载以恢复已保存版本。`); }
      if(lastError) throw Error(`保存失败：${error.message}；已恢复脚本注册，但部分页面未恢复：${lastError}`);
      throw Error(`保存失败：${error.message}；已恢复原有脚本与页面状态。`);
    }
    return {ok:true};
  };
  mutation=mutation.catch(()=>{}).then(action);
  mutation.then(result=>reply({result}),error=>{lastError=error.message;reply({error:{message:error.message}});});
  return true;
});
chrome.runtime.onInstalled.addListener(()=>{mutation=mutation.catch(()=>{}).then(()=>settings().then(s=>apply(s.scripts))).catch(e=>{lastError=e.message;});});
connect();
