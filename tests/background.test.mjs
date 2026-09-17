import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as updates from '../extension/updates.js';
import {webcrypto} from 'node:crypto';
import {prepareImport,parseScript} from '../extension/metadata.js';
import {resolveEntry} from '../extension/entries.js';
import {parsePairing,bridgeIdle} from '../extension/connection.js';
const sockets=[];
class WebSocket {
  constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
  send(message){this.sent.push(JSON.parse(message));}
  close(){this.readyState=3;this.onclose?.();}
  open(){this.readyState=1;this.onopen?.();}
}
let release, onMessage, onHistory, onUpdated, onActivated, onRemoved, onAlarm, storedScripts=[];
const listener={addListener(){}};
const badges=new Map(),titles=new Map();
const context=vm.createContext({WebSocket,URL,setTimeout(){},fetch:async()=>({text:async()=>''}),chrome:{action:{setBadgeText:async({tabId,text})=>badges.set(tabId,text),setBadgeBackgroundColor:async()=>{},setBadgeTextColor:async()=>{},setTitle:async({tabId,title})=>titles.set(tabId,title)},storage:{local:{get:async()=>({scripts:storedScripts,token:'test-token'})}},runtime:{getURL:p=>'chrome-extension://test/'+p,onInstalled:listener,onMessage:{addListener(handler){onMessage=handler;}}},alarms:{get:async()=>undefined,create(){},onAlarm:{addListener(handler){onAlarm=handler;}}},tabs:{query:async()=>[],onRemoved:{addListener(handler){onRemoved=handler;}},onUpdated:{addListener(handler){onUpdated=handler;}},onActivated:{addListener(handler){onActivated=handler;}},sendMessage:()=>new Promise(r=>release=r)},webNavigation:{onHistoryStateUpdated:{addListener(handler){onHistory=handler;}}}}});
Object.assign(context,updates);
context.parsePairing=parsePairing;context.bridgeIdle=bridgeIdle;
context.parseScript=parseScript;
context.resolveEntry=resolveEntry;
const source=fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
vm.runInContext(source,context);
await new Promise(setImmediate);
sockets[0].open();
const oldRequest=sockets[0].onmessage({data:JSON.stringify({id:1,method:'call',params:{pageId:1}})});
await vm.runInContext('socket.close(); socket=undefined; connecting=false; connect()',context);
sockets[1].open();
release({result:{result:'old-document-result'}});
await oldRequest;
assert.equal(sockets[1].sent.length,1);
assert.equal(sockets[1].sent[0].type,'hello');
assert.equal(sockets[0].sent.length,1);
sockets[0].onclose();
assert.equal(vm.runInContext('bridgeStatus',context),'已连接');

await vm.runInContext('socket.close()',context);
assert.equal(vm.runInContext('bridgeStatus',context),'等待本机桥接，自动重连中');
await vm.runInContext('connect()',context);
assert.equal(vm.runInContext('bridgeStatus',context),'等待本机桥接，自动重连中');
sockets.at(-1).open();
assert.equal(vm.runInContext('bridgeStatus',context),'已连接');

const response=await new Promise(resolve=>{assert.equal(onMessage({type:'status'},{url:'chrome-extension://test/manager.html',tab:{id:3}},resolve),true);});
assert.ok(response.result);
context.chrome.tabs.query=async()=>[{id:1,url:'http://localhost/'}];
context.chrome.userScripts={execute:async()=>[{result:undefined}]};
await assert.rejects(vm.runInContext("checkSyntax({source:'const = ;'})",context),/语法检查失败/);
context.chrome.userScripts.execute=async()=>[{result:true}];
await vm.runInContext("checkSyntax({source:'const valid = 1;'})",context);
// Chrome Web Store is HTTPS but cannot be scripted; exclude it in every injection path.
const restricted=['https://chromewebstore.google.com/detail/test','https://chrome.google.com/webstore/detail/test'];
for(const url of [...restricted,'chrome://extensions/','invalid'])assert.equal(vm.runInContext(`canScriptURL(${JSON.stringify(url)})`,context),false);
assert.equal(vm.runInContext("canScriptURL('https://chromewebstore.google.com.example.com/')",context),true);
context.chrome.tabs.query=async()=>[...restricted.map((url,i)=>({id:i+10,url})),{id:20,url:'https://example.com/'}];
const injectionTargets=[];
context.chrome.scripting={executeScript:async({target})=>{injectionTargets.push(target.tabId);return [];}};
context.chrome.userScripts={getScripts:async()=>[],register:async()=>{},unregister:async()=>{},execute:async({target})=>{injectionTargets.push(target.tabId);return [{result:true}];}};
await vm.runInContext("checkSyntax({source:'const valid = 1;'})",context);
await vm.runInContext('apply([], ["removed"])',context);
for(const url of restricted)await vm.runInContext(`inject({id:10,url:${JSON.stringify(url)}},[])`,context);
assert(injectionTargets.length>1);assert(injectionTargets.every(id=>id===20));
assert.equal(vm.runInContext('lastError',context),'');
const originalMessage=context.chrome.tabs.sendMessage;
context.chrome.tabs.sendMessage=async id=>{assert.equal(id,20);return {result:{native:true,tools:[]}};};
const restrictedPages=await vm.runInContext("dispatch('pages')",context);
assert.match(restrictedPages.pages[0].error,/扩展商店/);assert.equal(restrictedPages.pages[2].native,true);
// A discarded frame is not a global failure; real failures stay on their own current page.
context.chrome.tabs.sendMessage=async()=>({result:{native:true,tools:[]}});
context.chrome.scripting.executeScript=async()=>{throw Error('Frame with ID 0 was removed.');};
await vm.runInContext('apply([])',context);
assert.equal(vm.runInContext('lastError',context),'');
assert.equal((await vm.runInContext("page(20,'inspect')",context)).errors,undefined);
context.chrome.scripting.executeScript=async()=>{throw Error('CSP blocked script');};
await vm.runInContext('apply([])',context);
assert.deepEqual(Array.from((await vm.runInContext("page(20,'inspect')",context)).errors),['CSP blocked script']);
assert.equal((await vm.runInContext("page(21,'inspect')",context)).errors,undefined);
assert.equal(vm.runInContext('lastError',context),'');
onUpdated(20,{status:'loading'});
assert.equal((await vm.runInContext("page(20,'inspect')",context)).errors,undefined);
let failInjection;
context.chrome.scripting.executeScript=()=>new Promise((_,reject)=>failInjection=reject);
const navigationRace=vm.runInContext('apply([])',context);await new Promise(setImmediate);
onUpdated(20,{url:'https://example.com/new'});failInjection(Error('late script failure'));await navigationRace;
assert.equal(vm.runInContext('pageStates.has(20)',context),false);
context.chrome.scripting.executeScript=async()=>{throw Error('real failure');};
await vm.runInContext('apply([])',context);onRemoved(20);
assert.equal(vm.runInContext('pageStates.has(20)',context),false);
await vm.runInContext('apply([])',context);
context.chrome.scripting.executeScript=async()=>[];await vm.runInContext('apply([])',context);
assert.equal((await vm.runInContext("page(20,'inspect')",context)).errors,undefined);
onMessage({type:'changed',errors:['other page runtime failure']},{tab:{id:20},frameId:0},()=>{});
assert.equal(vm.runInContext('lastError',context),'');
context.chrome.tabs.sendMessage=originalMessage;
context.chrome.tabs.query=async()=>[];
await assert.rejects(vm.runInContext("checkSyntax({source:''})",context),/先打开/);
context.chrome.tabs.get=async id=>({id,url:'http://localhost/'});
context.injected=[];
vm.runInContext('inject=async (tab,scripts)=>injected.push(scripts.map(s=>s.id)); mutation=new Promise(resolve=>globalThis.finishMutation=resolve)',context);
storedScripts=[{id:'removed-script'}];
const historyTask=onHistory({frameId:0,tabId:1});
await Promise.resolve();assert.equal(context.injected.length,0);
storedScripts=[];context.finishMutation();await historyTask;
assert.deepEqual(Array.from(context.injected[0]),[]);
for(const port of [0,65536,1.5,'not-a-port']) {
  const response=await new Promise(resolve=>onMessage({type:'pair',token:'a'.repeat(64),port},{url:'chrome-extension://test/manager.html'},resolve));
  assert.match(response.error.message,/端口/);
}
context.prepareImport=prepareImport;
const scriptSource=id=>`// ==UserScript==\n// @id ${id}\n// @name Example\n// @version 1\n// @match http://localhost/*\n// ==/UserScript==\n`;
storedScripts=[prepareImport(scriptSource('old'),[])];
context.registry=storedScripts;context.applied=[];
context.chrome.tabs.query=async()=>[{id:1,url:'http://localhost/'}];
context.chrome.storage.local.set=async()=>{throw Error('QUOTA_BYTES quota exceeded');};
vm.runInContext('apply=async(scripts,removed)=>{registry=scripts;applied.push({ids:scripts.map(s=>s.id),removed});lastError=\"\"}',context);
const quota=await new Promise(resolve=>onMessage({type:'import',source:scriptSource('new')},{url:'chrome-extension://test/manager.html'},resolve));
assert.match(quota.error.message,/已恢复原有/);
assert.deepEqual(context.registry.map(s=>s.id),['old']);assert.deepEqual(storedScripts.map(s=>s.id),['old']);
assert.ok(context.applied.at(-1).removed.includes('new'));
const before=sockets.length;context.chrome.storage.local.get=async()=>({token:'test',port:'17891@evil.invalid'});
await vm.runInContext('socket.close();socket=undefined;connecting=false;connect()',context);
assert.equal(sockets.length,before);assert.match(vm.runInContext('bridgeStatus',context),/端口无效/);
console.log('background: disconnected call never replies to a replacement connection');
context.chrome.tabs.query=async()=>[{id:7,url:'https://example.com/',title:'Native site'}];
context.chrome.tabs.sendMessage=async()=>({result:{native:true,implementation:'native-0.4',tools:[{name:'website_native'}]}});
const uiPages=await new Promise(resolve=>onMessage({type:'pages'},{url:'chrome-extension://test/manager.html'},resolve));
assert.equal(uiPages.result.pages[0].tools[0].name,'website_native');
const uiInspect=await new Promise(resolve=>onMessage({type:'inspect',pageId:7},{url:'chrome-extension://test/popup.html'},resolve));
assert.equal(uiInspect.result.pageId,7);
assert.equal(onMessage({type:'pages'},{url:'https://example.com/'},()=>assert.fail('website cannot access manager messages')),undefined);

// The production wrapper accepts plain scripts and does not repeat side effects.
const ordinary={id:'ordinary',matches:['https://example.com/*'],source:"document.modelContext.registerTool({name:'site_read'});"};
const ordinaryCode=await vm.runInContext(`sourceFor(${JSON.stringify(ordinary)})`,context);
let nativeRegistrations=0;const pageErrors=[];
const nativePage=vm.createContext({document:{modelContext:{registerTool(){nativeRegistrations++;}}},WebMCPScript:{lifecycleVersion:1,beginScript(){return ()=>{};},request(_method,params){pageErrors.push(params.message);}}});
vm.runInContext(ordinaryCode,nativePage);vm.runInContext(ordinaryCode,nativePage);
assert.equal(nativeRegistrations,1);assert.deepEqual(pageErrors,[]);
const changedCode=await vm.runInContext(`sourceFor(${JSON.stringify({...ordinary,source:ordinary.source+'// update'})})`,context);
assert.throws(()=>vm.runInContext(changedCode,nativePage),/刷新/);assert.equal(nativeRegistrations,1);
const partialCode=await vm.runInContext(`sourceFor(${JSON.stringify({...ordinary,id:'partial',source:"globalThis.partial=(globalThis.partial||0)+1;throw Error('partial failure');"})})`,context);
assert.throws(()=>vm.runInContext(partialCode,nativePage),/partial failure/);vm.runInContext(partialCode,nativePage);assert.equal(nativePage.partial,1);

// Badges describe this tab's native tools, with connection failures taking priority.
await new Promise(setImmediate);
context.chrome.tabs.query=async()=>[{id:7},{id:8}];
context.chrome.tabs.get=async id=>({id,url:'https://example.com/',status:'complete'});
let snapshot={native:true,tools:[{name:'site_native'},{name:'script_native'}]};
context.chrome.tabs.sendMessage=async()=>({result:snapshot});
await vm.runInContext("bridgeStatus='已连接';refreshBadge(7)",context);
assert.equal(badges.get(7),'2');assert.match(titles.get(7),/当前页 2 个/);
snapshot={native:true,tools:[]};onActivated({tabId:8});await new Promise(setImmediate);
assert.equal(badges.get(8),'');assert.equal(badges.get(7),'2');
snapshot={native:true,tools:Array.from({length:100},()=>({}))};
onMessage({type:'changed'},{tab:{id:7},frameId:0},()=>{});await new Promise(setImmediate);
assert.equal(badges.get(7),'99+');assert.match(titles.get(7),/100 个/);
snapshot={native:false,tools:[]};await vm.runInContext('refreshBadge(7)',context);assert.equal(badges.get(7),'');
snapshot={native:true,tools:[],errors:['registration failed']};await vm.runInContext('refreshBadge(7)',context);assert.equal(badges.get(7),'!');
context.chrome.tabs.sendMessage=async()=>{throw Error('not ready');};
await vm.runInContext('refreshBadge(7)',context);assert.equal(badges.get(7),'?');
let finishInspect;context.chrome.tabs.sendMessage=()=>new Promise(resolve=>finishInspect=resolve);
const stale=vm.runInContext('refreshBadge(7)',context);await new Promise(setImmediate);
onUpdated(7,{status:'loading'});await new Promise(setImmediate);
assert.equal(badges.get(7),'');
finishInspect({result:{native:true,tools:[{}]}});await stale;assert.equal(badges.get(7),'');
context.chrome.tabs.sendMessage=async()=>({result:{native:true,tools:[{},{}]}});
vm.runInContext("setBridgeStatus('连接断开，自动重连中')",context);await new Promise(setImmediate);
assert.equal(badges.get(7),'2');assert.equal(badges.get(8),'2');assert(!titles.get(7).includes('连接断开'));
snapshot={native:true,tools:[]};context.chrome.tabs.sendMessage=async()=>({result:snapshot});
vm.runInContext("setBridgeStatus('等待本机桥接，自动重连中')",context);await new Promise(setImmediate);assert.equal(badges.get(7),'');
vm.runInContext("setBridgeStatus('本地端口无效，请重新配对')",context);await new Promise(setImmediate);assert.equal(badges.get(7),'!');
snapshot={native:true,tools:[{},{}]};
vm.runInContext("setBridgeStatus('已连接')",context);await new Promise(setImmediate);assert.equal(badges.get(7),'2');
context.chrome.tabs.get=async id=>({id,url:'chrome://newtab/'});
await vm.runInContext('refreshBadge(7)',context);assert.equal(badges.get(7),'');
onRemoved(7);assert.equal(vm.runInContext('badgeRequests.has(7)',context),false);
console.log('badges: native counts, per-tab updates, failures, reconnect and stale navigation results checked');

// Installed Chrome scripts are discoverable without open pages; metadata never exposes source or pairing data.
let entries=[];
storedScripts=[{...prepareImport(scriptSource('catalog').replace('// @name Example','// @name Console\n// @description WebApp 发布'),[]),enabled:false}];
context.chrome.storage.local.get=async()=>({scripts:storedScripts,entries,token:'private-token'});
context.chrome.storage.local.set=async value=>{entries=value.entries;};
context.chrome.tabs.query=async()=>[];
let catalog=await vm.runInContext("dispatch('catalog',{query:'webapp'})",context);
assert.equal(catalog.scripts[0].enabled,false);assert.equal(catalog.scripts[0].description,'WebApp 发布');
assert(!JSON.stringify(catalog).includes('source'));assert(!JSON.stringify(catalog).includes('private-token'));
context.chrome.tabs.get=async()=>({url:'https://console.example.com/#/project/test'});
const save={action:'save',name:'deal 测试',pageId:7,url:'https://console.example.com/#/project/test',expectedUrl:null};
await vm.runInContext(`dispatch('entry',${JSON.stringify(save)})`,context);
catalog=await vm.runInContext("dispatch('catalog',{query:'deal'})",context);
assert.equal(catalog.entries[0].url,save.url);
await assert.rejects(vm.runInContext(`dispatch('entry',${JSON.stringify(save)})`,context),/入口已变化/);
await assert.rejects(vm.runInContext(`dispatch('entry',${JSON.stringify({...save,name:'race',url:'https://other.example.com/'})})`,context),/页面地址已变化/);
for(const url of ['javascript:alert(1)','https://user:secret@example.com/','https://chromewebstore.google.com/']) {
  context.chrome.tabs.get=async()=>({url});
  await assert.rejects(vm.runInContext(`dispatch('entry',${JSON.stringify({...save,name:'invalid',url})})`,context),/普通 HTTP/);
}
context.chrome.storage.local.set=async()=>{throw Error('quota');};
await assert.rejects(vm.runInContext(`dispatch('entry',${JSON.stringify({action:'remove',name:save.name,expectedUrl:save.url})})`,context),/quota/);
assert.equal(entries.length,1);
context.chrome.storage.local.set=async value=>{entries=value.entries;};
await vm.runInContext(`dispatch('entry',${JSON.stringify({action:'remove',name:save.name,expectedUrl:save.url})})`,context);
assert.equal(entries.length,0);
console.log('catalog: closed-page discovery, disabled scripts, private data exclusion, persisted entries, stale writes and URL validation checked');

// MCP management shares the UI write path; preview is read-only and commits are one-shot.
{
context.crypto=webcrypto;context.TextEncoder=TextEncoder;
context.chrome.tabs.query=async()=>[{id:1,url:'http://localhost/'}];
context.chrome.storage.local.get=async()=>({scripts:storedScripts,token:'private-token'});
const saveScripts=async value=>{if(value.scripts)storedScripts=value.scripts;};
context.chrome.storage.local.set=saveScripts;
storedScripts=[];
const manage=(method,args)=>vm.runInContext(`dispatch(${JSON.stringify(method)},${JSON.stringify(args)})`,context);
const preview=args=>manage('script-preview',args),commit=token=>manage('script-commit',{token});
const original=scriptSource('managed'),updated=original.replace('@version 1','@version 2');
const install=await preview({action:'import',source:original});
assert.equal(storedScripts.length,0);assert.equal(install.before,null);assert.equal(install.after.enabled,true);
assert(!JSON.stringify(install).includes('private-token'));assert(!JSON.stringify(install).includes(original));
await commit(install.token);assert.equal(storedScripts[0].source,original);
await assert.rejects(commit(install.token),/已使用/);
const read=await manage('script-get',{id:'managed',limit:10});
assert.equal(read.source,original.slice(0,10));assert.equal(read.nextOffset,10);assert.equal(read.totalLength,original.length);
await assert.rejects(manage('script-get',{id:'managed',offset:-1}),/分页/);
await commit((await preview({action:'disable',id:'managed'})).token);
await commit((await preview({action:'import',source:updated})).token);
assert.equal(storedScripts[0].enabled,false);assert.equal(storedScripts[0].previousSource,original);
assert.equal((await manage('script-get',{id:'managed',version:'previous'})).source,original);
await commit((await preview({action:'restore',id:'managed'})).token);
assert.equal(storedScripts[0].source,original);assert.equal(storedScripts[0].enabled,false);
await commit((await preview({action:'enable',id:'managed'})).token);
assert.equal(storedScripts[0].enabled,true);
const stale=await preview({action:'remove',id:'managed'});
const ui=await new Promise(resolve=>onMessage({type:'toggle',id:'managed',enabled:false},{url:'chrome-extension://test/manager.html'},resolve));
assert(ui.result.ok);await assert.rejects(commit(stale.token),/状态已变化/);
const race=await preview({action:'enable',id:'managed'});
assert.equal((await Promise.allSettled([commit(race.token),commit(race.token)])).filter(r=>r.status==='fulfilled').length,1);
const expired=await preview({action:'remove',id:'managed'});
vm.runInContext(`scriptPreviews.get(${JSON.stringify(expired.token)}).expiresAt=0`,context);
await assert.rejects(commit(expired.token),/过期/);
const failed=await preview({action:'import',source:updated});
context.chrome.storage.local.set=async()=>{throw Error('quota');};
await assert.rejects(commit(failed.token),/已恢复原有/);
assert.equal(storedScripts[0].source,original);assert.equal(context.registry[0].source,original);
await assert.rejects(commit(failed.token),/已使用/);context.chrome.storage.local.set=saveScripts;
await assert.rejects(preview({action:'import',source:'not a userscript'}),/元数据/);
assert.equal((await commit((await preview({action:'remove',id:'managed'})).token)).removed,true);
assert.equal(storedScripts.length,0);
console.log('browser scripts: import/read/update/restore/toggle/remove, preview isolation, UI races, one-shot expiry and storage rollback checked');
}

// Scheduled updates work without pages or an MCP connection and never inject into existing documents.
{
const manage=(method,args)=>vm.runInContext(`dispatch(${JSON.stringify(method)},${JSON.stringify(args)})`,context);
const original=scriptSource('updater').replace('// ==/UserScript==','// @updateURL https://example.com/script\n// @downloadURL https://example.com/script\n// ==/UserScript=='),next=original.replace('@version 1','@version 2');
storedScripts=[{...parseScript(original),enabled:false}];
context.chrome.storage.local.get=async()=>({scripts:structuredClone(storedScripts)});
context.chrome.storage.local.set=async value=>{storedScripts=structuredClone(value.scripts);};
context.chrome.tabs.query=async()=>[];
vm.runInContext('registerScripts=async scripts=>{registry=scripts};socket=undefined',context);
const configure=async mode=>manage('update-settings',{id:'updater',expectedSha256:await updates.digest(storedScripts[0].source),expectedRevision:storedScripts[0].updates?.revision??null,mode,updateURL:'https://ignored.example/script',downloadURL:'https://ignored.example/script'});
await configure('auto');
assert.equal(storedScripts[0].updates.updateURL,'https://example.com/script');
await assert.rejects(manage('update-settings',{id:'updater',mode:'manual',expectedSha256:'stale'}),/已变化/);
let fetched=0,downloaded=next;
context.inspectUpdate=script=>updates.inspectUpdate(script,async()=>{fetched++;return new Response(downloaded);});
assert.equal((await manage('update-check',{id:'updater'})).updates.status,'available');
assert.equal(storedScripts[0].source,original); // Manual checking cannot install.
storedScripts[0].updates.lastCheck=0;
onAlarm({name:'script-updates'});await vm.runInContext('mutation',context);
assert.equal(storedScripts[0].source,next);assert.equal(storedScripts[0].previousSource,original);assert.equal(storedScripts[0].enabled,false);
assert.equal(storedScripts[0].updates.status,'updated');assert(storedScripts[0].activateAfter);
const before=fetched;onAlarm({name:'script-updates'});await vm.runInContext('mutation',context);assert.equal(fetched,before);
// A route event/retry in an older document must also keep the downloaded code dormant.
const gated=await vm.runInContext(`sourceFor(${JSON.stringify({...storedScripts[0],source:'globalThis.executed=true;'})})`,context);
const oldDocument=vm.createContext({performance:{timeOrigin:1}});vm.runInContext(gated,oldDocument);assert.equal(oldDocument.executed,undefined);
storedScripts[0].source+='\n// local edit';storedScripts[0].updates.lastCheck=0;
downloaded=next.replace('@version 2','@version 3');
onAlarm({name:'script-updates'});await vm.runInContext('mutation',context);
assert.equal(storedScripts[0].version,'2');assert.match(storedScripts[0].updates.reasons.join(),/本地源码/);
const preview=await manage('script-preview',{action:'update',id:'updater'});
assert.equal(preview.candidateSource,downloaded);assert.match(preview.reviewReasons.join(),/本地源码/);
await manage('script-commit',{token:preview.token});assert.equal(storedScripts[0].version,'3');
await configure('notify');downloaded=downloaded.replace('@version 3','@version 4');
onAlarm({name:'script-updates'});await vm.runInContext('mutation',context);assert.equal(storedScripts[0].version,'3');assert.equal(storedScripts[0].updates.status,'available');
await configure('auto');
context.chrome.storage.local.set=async value=>{if(value.scripts[0].version==='4')throw Error('quota');storedScripts=structuredClone(value.scripts);};
onAlarm({name:'script-updates'});await vm.runInContext('mutation',context);
assert.equal(storedScripts[0].version,'3');assert.equal(context.registry[0].version,'3');assert.equal(storedScripts[0].updates.status,'error');
console.log('scheduled updates: independent alarms, manual checks, notify/auto, stale policies, local conflicts, frozen preview, deferred route execution and quota rollback checked');
}
