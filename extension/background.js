import {resolveEntry} from './entries.js';
import {prepareImport,parseScript} from './metadata.js';
import {parsePairing} from './connection.js';
let socket, connecting = false, bridgeStatus = '未配对', lastError = '', mutation = Promise.resolve();
const runtimeCode = fetch(chrome.runtime.getURL('runtime.js')).then(r => r.text());
const settings = async () => ({scripts:[], token:'', port:17891, ...await chrome.storage.local.get(['scripts','token','port'])});
const notify = () => { if (socket?.readyState === 1) socket.send(JSON.stringify({type:'changed'})); };
const badgeRequests = new Map();
const pageStates = new Map();
async function updatePage(tabId,action) {
  const state={error:''};pageStates.set(tabId,state);
  try {await action();}catch(error) {
    // Only maintenance injection can become obsolete during navigation. Never retry tool calls.
    if(pageStates.get(tabId)!==state||/Frame with ID \d+ was removed|No tab with id|No frame with id/i.test(error.message))return;
    state.error=error.message;
  }
}
function canScriptURL(value) {
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&url.hostname!=='chromewebstore.google.com'&&
      !(url.hostname==='chrome.google.com'&&/^\/webstore(?:\/|$)/.test(url.pathname));
  }catch{return false;}
}
async function refreshBadge(tabId, loading=false) {
  const request=Symbol();badgeRequests.set(tabId,request);
  const paint=async(text,color,title)=>{
    if(badgeRequests.get(tabId)!==request)return;
    await Promise.all([
      chrome.action.setBadgeText({tabId,text}),
      chrome.action.setBadgeBackgroundColor({tabId,color}),
      chrome.action.setBadgeTextColor({tabId,color:'#ffffff'}),
      chrome.action.setTitle({tabId,title:`WebMCP Script · ${title}`})
    ]);
  };
  try {
    if(bridgeStatus!=='已连接')return await paint(bridgeStatus==='连接中…'?'':'!',bridgeStatus==='未配对'?'#986b24':'#b4483c',bridgeStatus);
    const tab=await chrome.tabs.get(tabId);
    if(!canScriptURL(tab.url))return await paint('','#737780','此页面不支持读取 WebMCP');
    await paint('','#737780','本地桥接已连接 · 正在检测页面工具');
    if(loading||tab.status==='loading')return;
    const snapshot=await page(tabId,'inspect');
    if(snapshot.native===false)return await paint('','#737780','浏览器未提供原生 WebMCP 接口');
    if(snapshot.errors?.length)return await paint('!','#b4483c','页面工具异常 · 打开插件查看详情');
    if(snapshot.native!==true||!Array.isArray(snapshot.tools))return await paint('?','#986b24','页面工具尚未就绪');
    const count=snapshot.tools.length;
    await paint(count>99?'99+':count?String(count):'',count?'#28834d':'#737780',`本地桥接已连接 · 当前页 ${count} 个 WebMCP 工具`);
  } catch {
    await paint('?','#986b24','无法读取页面工具 · 打开插件查看详情').catch(()=>{});
  }
}
async function refreshBadges() {
  try {await Promise.all((await chrome.tabs.query({})).map(tab=>refreshBadge(tab.id)));}catch{}
}
function setBridgeStatus(status) {bridgeStatus=status;void refreshBadges();}
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
  const tab=(await chrome.tabs.query({})).find(tab=>canScriptURL(tab.url));
  if(!tab) throw Error('请先打开一个普通 HTTP(S) 网页，再保存脚本；原有脚本已保留');
  const results=await execute({target:{tabId:tab.id},world:'MAIN',js:[{code:`(() => {\n${script.source}\n}); true;`}]});
  if(!results.some(result=>result.result===true)) throw Error('脚本语法检查失败，原有脚本已保留');
}
async function sourceFor(script) {
  return `${await runtimeCode}
(() => {
  const runs = globalThis[Symbol.for('webmcp-script.executions')] ||= new Map();
  const id = ${JSON.stringify(script.id)}, source = ${JSON.stringify(script.source)};
  const previous = runs.get(id);
  if (previous?.disabled) throw Error('脚本已重新启用，请刷新此页面以加载工具');
  if (previous && !previous.helper) {
    if (previous.source !== source) throw Error('脚本已更新，请刷新此页面以加载新版本');
    return;
  }
  const record = {source, helper:false};
  if(globalThis.WebMCPScript.lifecycleVersion!==1) throw Error('页面连接需要更新，请刷新网页后重试');
  const endScript=globalThis.WebMCPScript.beginScript(id,${JSON.stringify(script.name)},previous?.helper);
  runs.set(id, record);
  const WebMCPScript = {...globalThis.WebMCPScript, install(spec) {
    if(spec.id !== id) throw Error('脚本 ID 与元数据不一致');
    globalThis.WebMCPScript.install({...spec,matches:${JSON.stringify(script.matches)}});
    record.helper = true;
  }};
  try {
${script.source}
  } catch (error) {
    // A script may have partially executed: do not repeat it in this document.
    record.helper = false;
    WebMCPScript.request('error', {id,message:error.message});
    throw error;
  } finally {endScript();}
})();
//# sourceURL=webmcp-script-${script.id}.user.js`;
}
async function page(pageId, method, params={}) {
  if (!Number.isInteger(Number(pageId))) throw Error('无效 pageId');
  const data = await chrome.tabs.sendMessage(Number(pageId), {type:'page',method,params}, {frameId:0});
  if (data.error) throw Error(data.error.message);
  const error=method==='inspect'?pageStates.get(Number(pageId))?.error:undefined;
  return {...data.result, pageId:Number(pageId),...(error?{errors:[...new Set([...(data.result.errors||[]),error])]}:{})};
}
async function inject(tab, scripts) {
  if (!canScriptURL(tab.url)) return;
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
  await Promise.all(tabs.filter(t=>canScriptURL(t.url)).map(tab=>updatePage(tab.id,async()=>{
      for (const id of removed) {
        await execute({target:{tabId:tab.id},world:'MAIN',js:[{code:`(async () => {
          const run = globalThis[Symbol.for('webmcp-script.executions')]?.get(${JSON.stringify(id)});
          if(!run)return;
          if (globalThis.WebMCPScript?.lifecycleVersion!==1) throw Error('旧页面无法撤销脚本工具，请刷新页面完成停用');
          if(!run.helper)run.disabled=true;
          await globalThis.WebMCPScript.request('remove',{id:${JSON.stringify(id)}});
        })();`}]});
      }
      await inject(tab,scripts);
  })));
  notify();
  void refreshBadges();
}
async function manageScript(message) {
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
    try { await chrome.storage.local.set({scripts}); notify(); } catch(error) {
      try { await apply(state.scripts,scripts.map(script=>script.id)); }
      catch(rollbackError) { throw Error(`保存失败：${error.message}；自动恢复未完成：${rollbackError.message}。请重试加载以恢复已保存版本。`); }
      const recoveryErrors=[...pageStates.values()].map(state=>state.error).filter(Boolean);
      if(recoveryErrors.length) throw Error(`保存失败：${error.message}；已恢复脚本注册，但部分页面未恢复：${recoveryErrors.join('；')}`);
      throw Error(`保存失败：${error.message}；已恢复原有脚本与页面状态。`);
    }
    return {ok:true};
}
const scriptPreviews=new Map();
const scriptHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function scriptSummary(script) {
  if(!script)return null;
  const {id,name,version,matches,description,entries}=parseScript(script.source);
  return {id,name,version,matches,description,entries,enabled:script.enabled,sha256:await scriptHash(script.source),canRestore:!!script.previousSource};
}
async function manageBrowserScript(method,params) {
  const {scripts}=await settings();
  if(method==='script-get') {
    const script=scripts.find(s=>s.id===params.id);
    if(!script)throw Error('脚本不存在，请查询 browser_catalog');
    if(!['current','previous'].includes(params.version??'current'))throw Error('无效源码版本');
    const source=params.version==='previous'?script.previousSource:script.source;
    if(source===undefined)throw Error('没有可恢复的上一版');
    const offset=params.offset??0,limit=params.limit??64000;
    if(!Number.isInteger(offset)||offset<0||offset>source.length||!Number.isInteger(limit)||limit<1||limit>64000)throw Error('无效源码分页');
    return {storage:'connected-chrome-extension',script:await scriptSummary(script),version:params.version??'current',sha256:await scriptHash(source),source:source.slice(offset,offset+limit),offset,totalLength:source.length,nextOffset:offset+limit<source.length?offset+limit:null};
  }
  if(method==='script-preview') {
    const {action}=params;
    if(!['import','enable','disable','remove','restore'].includes(action))throw Error('未知脚本管理操作');
    if(action!=='import'&&(typeof params.id!=='string'||!params.id))throw Error('需要脚本 ID');
    const parsed=action==='import'?parseScript(params.source):null;
    if(parsed&&params.id!==undefined&&params.id!==parsed.id)throw Error('脚本 ID 与源码不一致');
    const old=scripts.find(s=>s.id===(parsed?.id??params.id));
    if(!parsed&&!old)throw Error('脚本不存在，请查询 browser_catalog');
    if((action==='enable'&&old.enabled)||(action==='disable'&&!old.enabled))throw Error('脚本已处于目标启停状态，无需修改');
    let next,message;
    if(action==='import'||action==='restore') {
      const source=parsed?.source??old.previousSource;
      if(source===undefined)throw Error('没有可恢复的上一版');
      next=prepareImport(source,scripts,old?.id,old?.source,old?.enabled);
      message={type:'import',source:next.source,replace:old?.id,expectedSource:old?.source,expectedEnabled:old?.enabled};
    } else if(action==='remove')message={type:'remove',id:old.id};
    else {next={...old,enabled:action==='enable'};message={type:'toggle',id:old.id,enabled:next.enabled};}
    const now=Date.now();
    for(const [token,preview] of scriptPreviews)if(preview.expiresAt<=now)scriptPreviews.delete(token);
    if(scriptPreviews.size>=20)throw Error('待提交预览过多，请完成已有预览或等待五分钟后重试');
    const token=crypto.randomUUID(),expiresAt=now+300000;
    scriptPreviews.set(token,{message,fingerprint:await scriptHash(JSON.stringify(scripts)),expiresAt,id:next?.id??old.id});
    return {storage:'connected-chrome-extension',token,expiresAt,action,before:await scriptSummary(old),after:await scriptSummary(next),effect:action==='remove'?'卸载并删除当前和上一版源码；不会撤销已经发生的网站操作。':'保存后应用到匹配网页；启用脚本会执行源码，普通脚本更新或重新启用后可能需要刷新页面。',pageVerification:'提交后需重新发现页面工具；预览不会执行脚本。'};
  }
  if(method==='script-commit') {
    if(typeof params.token!=='string')throw Error('需要预览 token');
    const preview=scriptPreviews.get(params.token);
    scriptPreviews.delete(params.token);
    if(!preview||preview.expiresAt<=Date.now())throw Error('预览已过期或已使用，请重新预览');
    if(preview.fingerprint!==await scriptHash(JSON.stringify(scripts)))throw Error('脚本状态已变化，请重新预览');
    await manageScript(preview.message);
    const current=(await settings()).scripts.find(s=>s.id===preview.id);
    return {storage:'connected-chrome-extension',saved:true,script:await scriptSummary(current),removed:!current,pageErrors:[...pageStates].filter(([,state])=>state.error).map(([pageId,state])=>({pageId,error:state.error})),pageVerification:'脚本已保存；普通脚本更新或重新启用后需刷新页面并重新发现工具，不能据此声称新版工具已可用。'};
  }
  throw Error('未知脚本管理操作');
}
async function dispatch(method,params={}) {
  if(['script-get','script-preview','script-commit'].includes(method)) {
    mutation=mutation.catch(()=>{}).then(()=>manageBrowserScript(method,params));
    return mutation;
  }
  if (method === 'catalog') {
    if(params.query!==undefined&&(typeof params.query!=='string'||params.query.length>200))throw Error('无效搜索词');
    const {scripts}=await settings(), {entries=[]}=await chrome.storage.local.get('entries');
    const query=(params.query||'').toLowerCase();
    const matches=value=>JSON.stringify(value).toLowerCase().includes(query);
    return {storage:'connected-chrome-extension',scripts:scripts.map(script=>{
      const {id,name,version,matches,description,entries}=parseScript(script.source);
      return {id,name,version,matches,description,entries,enabled:script.enabled};
    }).filter(matches),entries:entries.filter(matches),nextStep:'使用 pages 或 visit_page 打开已确认的入口，再发现原生工具；安装清单不代表页面工具已就绪。'};
  }
  if (method === 'resolve-entry') {
    const stored=(await settings()).scripts.find(script=>script.id===params.scriptId);
    if(!stored)throw Error('脚本未安装，请重新查询 browser_catalog');
    const script={...parseScript(stored.source),enabled:stored.enabled};
    if(params.expectedVersion!==script.version)throw Error('脚本版本已变化，请重新查询 browser_catalog');
    return resolveEntry(script,params.entryId,params.parameters??{});
  }
  if (method === 'entry') {
    const action=async()=>{
      if(!['save','remove'].includes(params.action)||typeof params.name!=='string'||!params.name.trim()||params.name.length>160)throw Error('无效入口操作或名称');
      const name=params.name.trim(), {entries=[]}=await chrome.storage.local.get('entries');
      const old=entries.find(entry=>entry.name===name);
      if(params.expectedUrl!==(old?.url??null))throw Error('入口已变化，请重新读取 browser_catalog');
      let entry;
      if(params.action==='save') {
        if(!Number.isInteger(params.pageId)||params.pageId<=0)throw Error('保存入口需要已确认页面的 pageId');
        const tab=await chrome.tabs.get(params.pageId);
        if(params.url!==tab.url)throw Error('页面地址已变化，请重新读取 pages 并确认入口');
        const url=new URL(tab.url);
        if(!canScriptURL(url.href)||url.username||url.password)throw Error('入口必须是无登录凭据的普通 HTTP(S) 页面');
        entry={name,url:url.href};
      }
      const next=entries.filter(item=>item.name!==name);
      if(entry)next.push(entry);
      if(next.length>500)throw Error('入口数量已达 500 个，请先移除不用的入口');
      await chrome.storage.local.set({entries:next});notify();
      return {entry:entry??null,removed:!entry};
    };
    mutation=mutation.catch(()=>{}).then(action);
    return mutation;
  }
  if (method === 'pages') {
    const tabs = (await chrome.tabs.query({})).filter(t=>/^https?:/.test(t.url||''));
    return {pages:await Promise.all(tabs.map(async t=> {try {
      if(!canScriptURL(t.url))return {id:t.id,url:t.url,title:t.title,tools:[],error:'Chrome 扩展商店不允许扩展读取或注入脚本；不影响其他网页和本机连接。'};
      return {id:t.id,...await page(t.id,'inspect')};
    } catch(e) {return {id:t.id,url:t.url,title:t.title,tools:[],error:e.message};}}))};
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
  if(!Number.isInteger(port)||port<1||port>65535) {setBridgeStatus('本地端口无效，请重新配对');connecting=false;return;}
  if (!token) {setBridgeStatus('未配对');connecting=false;return;}
  if(bridgeStatus!=='等待本机桥接，自动重连中')setBridgeStatus('连接中…');
  const ws=new WebSocket(`ws://127.0.0.1:${port}/extension?token=${encodeURIComponent(token)}`);
  socket=ws;
  ws.onopen=()=>{if(socket!==ws)return;connecting=false;setBridgeStatus('已连接');ws.send(JSON.stringify({type:'hello',version:'0.4.0-beta.2'}));};
  ws.onclose=()=>{if(socket!==ws)return;connecting=false;setBridgeStatus('等待本机桥接，自动重连中');setTimeout(connect,3000);};
  ws.onerror=()=>{if(socket===ws)setBridgeStatus('等待本机桥接，自动重连中');};
  ws.onmessage=async event=> {
    let message;
    try { message=JSON.parse(event.data); if(message.type==='ping') {if(ws.readyState===1)ws.send(JSON.stringify({type:'pong'}));return;} if(!message.id || !message.method) return;
      const result=await dispatch(message.method,message.params); if(ws.readyState===1)ws.send(JSON.stringify({id:message.id,result}));
    } catch(e) { if(ws.readyState===1 && message?.id) ws.send(JSON.stringify({id:message.id,error:{message:e.message}})); }
  };
}
chrome.alarms.create('reconnect',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(connect);
chrome.tabs.onRemoved.addListener(id=>{badgeRequests.delete(id);pageStates.delete(id);notify();});
chrome.tabs.onActivated.addListener(({tabId})=>{void refreshBadge(tabId);});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url || change.status==='loading')pageStates.delete(id);if(change.url || change.status) {notify();void refreshBadge(id,change.status==='loading');}});
chrome.webNavigation.onHistoryStateUpdated.addListener(async details=>{
  if(details.frameId!==0) return;
  mutation=mutation.catch(()=>{}).then(async()=>{
    await updatePage(details.tabId,async()=>inject(await chrome.tabs.get(details.tabId),(await settings()).scripts));
    notify();
    void refreshBadge(details.tabId);
  });
  await mutation;
});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='changed') {if(sender.tab && sender.frameId===0)void refreshBadge(sender.tab.id);notify();return;}
  if(!sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const action=async()=>{
    if(message.type==='status') {let available=true,permissionError='';try {await api().getScripts();} catch(e) {available=false;permissionError=e.message;} return {...await settings(),bridgeStatus,lastError:permissionError||lastError,userScriptsAvailable:available};}
    if(message.type==='pages') return dispatch('pages');
    if(message.type==='inspect') return dispatch('inspect',{pageId:message.pageId});
    if(message.type==='pair') {const {token,port}=parsePairing(message.token,message.port??17891);await chrome.storage.local.set({token,port});socket?.close();socket=undefined;connecting=false;await connect();return {ok:true};}
    if(message.type==='retry') {const state=await settings();await apply(state.scripts);await connect();return {ok:true};}
    return manageScript(message);
  };
  mutation=mutation.catch(()=>{}).then(action);
  mutation.then(result=>reply({result}),error=>{if(!['inspect','pages','status'].includes(message.type))lastError=error.message;reply({error:{message:error.message}});});
  return true;
});
chrome.runtime.onInstalled.addListener(()=>{mutation=mutation.catch(()=>{}).then(()=>settings().then(s=>apply(s.scripts))).catch(e=>{lastError=e.message;});});
connect();
