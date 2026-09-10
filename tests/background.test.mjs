import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareImport} from '../extension/metadata.js';
const sockets=[];
class WebSocket {
  constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
  send(message){this.sent.push(JSON.parse(message));}
  close(){this.readyState=3;this.onclose?.();}
  open(){this.readyState=1;this.onopen?.();}
}
let release, onMessage, onHistory, storedScripts=[];
const listener={addListener(){}};
const context=vm.createContext({WebSocket,URL,setTimeout(){},fetch:async()=>({text:async()=>''}),chrome:{storage:{local:{get:async()=>({scripts:storedScripts,token:'test-token'})}},runtime:{getURL:p=>'chrome-extension://test/'+p,onInstalled:listener,onMessage:{addListener(handler){onMessage=handler;}}},alarms:{create(){},onAlarm:listener},tabs:{onRemoved:listener,onUpdated:listener,sendMessage:()=>new Promise(r=>release=r)},webNavigation:{onHistoryStateUpdated:{addListener(handler){onHistory=handler;}}}}});
const source=fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').replace("import {prepareImport} from './metadata.js';",'');
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
const response=await new Promise(resolve=>{assert.equal(onMessage({type:'status'},{url:'chrome-extension://test/manager.html',tab:{id:3}},resolve),true);});
assert.ok(response.result);
context.chrome.tabs.query=async()=>[{id:1,url:'http://localhost/'}];
context.chrome.userScripts={execute:async()=>[{result:undefined}]};
await assert.rejects(vm.runInContext("checkSyntax({source:'const = ;'})",context),/语法检查失败/);
context.chrome.userScripts.execute=async()=>[{result:true}];
await vm.runInContext("checkSyntax({source:'const valid = 1;'})",context);
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
  const response=await new Promise(resolve=>onMessage({type:'pair',token:'test',port},{url:'chrome-extension://test/manager.html'},resolve));
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
