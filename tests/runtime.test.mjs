import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const registered=new Map(),calls=[];let listener=()=>{};
const native={
 addEventListener(_type,fn){listener=fn;},
 async registerTool(tool,{signal}={}){if(registered.has(tool.name))throw Error('duplicate');registered.set(tool.name,tool);signal?.addEventListener('abort',()=>{registered.delete(tool.name);listener();},{once:true});listener();},
 async getTools(){return [...registered.values()].map(t=>({...t,inputSchema:JSON.stringify(t.inputSchema)}));},
 async executeTool(tool,input){calls.push(tool.name);const current=registered.get(tool.name);if(!current)throw Error('stale');return JSON.stringify(await current.execute(JSON.parse(input)));}
};
const context=vm.createContext({AbortController,AbortSignal,structuredClone,crypto:{randomUUID:()=> 'document-1'},URL,location:{href:'http://localhost/'},document:{title:'Demo',modelContext:native},history:{pushState(_a,_b,url){context.location.href=new URL(url,context.location.href).href;},replaceState(){}},addEventListener(){},window:{postMessage(){}}});
const source=fs.readFileSync(new URL('../extension/runtime.js',import.meta.url),'utf8');vm.runInContext(source,context);const runtime=context.WebMCPScript;
await native.registerTool({name:'website_native',description:'Native website tool',inputSchema:{type:'object'},execute:()=> 'site'});
let snapshot=await runtime.snapshot();assert.equal(snapshot.tools[0].name,'website_native');
assert.equal((await runtime.request('call',{name:'website_native',revision:snapshot.revision,input:{}})).result,'"site"');
let release;
runtime.install({id:'demo',matches:['http://localhost/allowed*'],tools:[{name:'sum',description:'Sum',inputSchema:{type:'object'},execute:({a,b})=>a+b},{name:'slow',description:'Pending',inputSchema:{type:'object'},execute:()=>new Promise(r=>release=r)}]});
assert.equal((await runtime.snapshot()).tools.length,1);context.history.pushState(null,'','/allowed');snapshot=await runtime.snapshot();assert.equal(snapshot.tools.length,3);
assert.equal((await runtime.request('call',{name:'demo__sum',revision:snapshot.revision,input:{a:2,b:3}})).result,'5');
assert.deepEqual(calls,['website_native','demo__sum']);
const pending=runtime.request('call',{name:'demo__slow',revision:snapshot.revision,input:{}});await new Promise(r=>setTimeout(r,0));
await assert.rejects(runtime.request('call',{name:'demo__sum',revision:snapshot.revision,input:{}}),/仍在执行/);
context.history.pushState(null,'','/other');assert.equal((await runtime.snapshot()).tools.length,1);assert(registered.has('website_native'));release('done');await pending;
context.history.pushState(null,'','/allowed');assert.equal((await runtime.snapshot()).tools.length,3);
await assert.rejects(runtime.request('call',{name:'demo__sum',revision:snapshot.revision,input:{}}),/已变化/);
await runtime.request('remove',{id:'demo'});assert.equal((await runtime.snapshot()).tools.length,1);
// Standard native scripts retain their names; ownership survives asynchronous callbacks.
await vm.runInContext(`(async()=>{
 const end=WebMCPScript.beginScript('plain','普通脚本');
 try {
  globalThis.registerLater=()=>document.modelContext.registerTool({name:'later',description:'Late',inputSchema:{type:'object'},execute:()=> 'later'});
  await document.modelContext.registerTool({name:'plain_read',description:'Read',inputSchema:{type:'object'},execute:()=> 'read'});
 } finally {end();}
})();\n//# sourceURL=webmcp-script-plain.user.js`,context);
await context.registerLater();
snapshot=await runtime.snapshot();
assert.equal(snapshot.tools.find(t=>t.name==='plain_read').source.name,'普通脚本');
assert.equal(snapshot.tools.find(t=>t.name==='later').source.id,'plain');
assert.equal(snapshot.tools.find(t=>t.name==='website_native').source.kind,'page');
assert.equal((await runtime.request('describe',{name:'plain_read',revision:snapshot.revision})).source.id,'plain');
const cached=registered.get('plain_read');
const endDuplicate=runtime.beginScript('duplicate','重复名称');
await assert.rejects(native.registerTool({name:'plain_read',description:'Collision',inputSchema:{type:'object'},execute:()=> 'wrong'}),/duplicate/);endDuplicate();
assert.equal((await runtime.snapshot()).tools.find(t=>t.name==='plain_read').source.id,'plain');
await runtime.request('remove',{id:'plain'});
assert(!registered.has('plain_read'));assert(!registered.has('later'));assert(registered.has('website_native'));
assert.throws(()=>cached.execute(),/已停用/);
await assert.rejects(context.registerLater(),/已停用/);
await assert.rejects(runtime.request('call',{name:'plain_read',revision:snapshot.revision,input:{}}),/已变化/);
assert.throws(()=>runtime.beginScript('plain','普通脚本'),/刷新/);
const reusable={id:'reusable',tools:[{name:'read',description:'Read',inputSchema:{type:'object'},execute:()=> 'ok'}]};
runtime.install(reusable);assert((await runtime.snapshot()).tools.some(t=>t.name==='reusable__read'));
await runtime.request('remove',{id:'reusable'});runtime.install(reusable);
assert((await runtime.snapshot()).tools.some(t=>t.name==='reusable__read'));
await runtime.request('remove',{id:'reusable'});
const delayedSpec={id:'late',tools:[{name:'ping',description:'Delayed native',inputSchema:{type:'object'},execute:()=> 'ok'}]};
function delayedContext(onTimer=()=>{}) {
 let elapsed=0;
 const sandbox=vm.createContext({AbortController,AbortSignal,structuredClone,crypto:{randomUUID:()=> 'late-native'},URL,Date:{now:()=>elapsed},setTimeout(fn,ms){elapsed+=ms;onTimer(sandbox);queueMicrotask(fn);},location:{href:'http://localhost/'},document:{title:'Late native'},history:{pushState(){},replaceState(){}},addEventListener(){},window:{postMessage(){}}});
 vm.runInContext(source,sandbox);return sandbox;
}
const noNative=delayedContext();noNative.WebMCPScript.install(delayedSpec);
const absent=await noNative.WebMCPScript.snapshot();assert.equal(absent.native,false);assert.equal(absent.tools.length,0);assert(absent.errors.some(e=>e.includes('脚本未注册')));
const delayed=delayedContext(c=>{c.document.modelContext=native;});delayed.WebMCPScript.install(delayedSpec);
assert((await delayed.WebMCPScript.snapshot()).tools.some(t=>t.name==='late__ping'));
await delayed.WebMCPScript.request('remove',{id:'late'});
const removed=delayedContext(c=>{c.document.modelContext=native;});removed.WebMCPScript.install(delayedSpec);
await removed.WebMCPScript.request('remove',{id:'late'});assert(!registered.has('late__ping'),'removal while waiting must not register a tool later');
const registrationOnly=delayedContext(c=>{c.document.modelContext={registerTool:native.registerTool};});
registrationOnly.WebMCPScript.install(delayedSpec);await registrationOnly.WebMCPScript.snapshot();assert(registered.has('late__ping'),'script injection only requires native registration, not bridge introspection');
await registrationOnly.WebMCPScript.request('remove',{id:'late'});
console.log('native source of truth, delayed API registration, timeout and cancellation verified');
