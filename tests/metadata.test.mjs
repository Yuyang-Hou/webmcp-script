import assert from 'node:assert/strict';
import {prepareImport,createScriptTemplate} from '../extension/metadata.js';
const source=version=>`// ==UserScript==\n// @id example\n// @name Example\n// @version ${version}\n// @match https://example.com/*\n// ==/UserScript==\nWebMCPScript.install({id:'example',tools:[]});`;
const first=prepareImport(source('1'),[]);
assert.equal(first.enabled,true);
const old={...first,enabled:false};
const update=prepareImport(source('2'),[old],old.id,old.source);
assert.equal(update.enabled,false);
assert.equal(update.previousSource,old.source);
const restore=prepareImport(update.previousSource,[update],update.id,update.source);
assert.equal(restore.version,'1');assert.equal(restore.enabled,false);assert.equal(restore.previousSource,update.source);
assert.throws(()=>prepareImport(source('2'),[old]),/已安装/);
assert.throws(()=>prepareImport(source('2'),[old],old.id,'stale source'),/其他窗口/);
assert.throws(()=>prepareImport(source('2'),[],'example',old.source),/目标已变化/);
assert.throws(()=>prepareImport(old.source,[old],old.id,old.source),/一致/);
assert.throws(()=>prepareImport(source('2'),[old],old.id,old.source,true),/启停状态/);
console.log('metadata: update preserves disabled state; one-level restore and stale previews checked');

const template=createScriptTemplate(), parsed=prepareImport(template,[]);
assert.deepEqual(parsed.matches,['https://example.com/*']);
assert(!template.includes('WebMCPScript'));
assert(!template.includes('@id '));
assert(!template.includes('@require'));
assert.notEqual(prepareImport(createScriptTemplate(),[]).id,parsed.id);
const {runInNewContext}=await import('node:vm');
const window=new EventTarget();window.top=window;
const registrations=[];
runInNewContext(template,{window,AbortController,console,document:{title:'Template test',modelContext:{registerTool:(tool,options)=>registrations.push({tool,...options})}}});
assert.equal(await registrations[0].tool.execute(),'Template test');
assert.equal(registrations[0].signal.aborted,false);
window.dispatchEvent(new Event('pageshow'));assert.equal(registrations.length,1);
window.dispatchEvent(new Event('pagehide'));assert.equal(registrations[0].signal.aborted,true);
window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
assert.equal(registrations.length,2);assert.equal(registrations[1].signal.aborted,false);
let warning='';
runInNewContext(template,{window,document:{},console:{warn:message=>warning=message}});
assert.match(warning,/原生 WebMCP/);
let failedSignal,reported=false;
runInNewContext(template,{window,AbortController,console:{error:()=>reported=true},document:{modelContext:{registerTool:async(_,options)=>{failedSignal=options.signal;throw Error('duplicate');}}}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(failedSignal.aborted,true);assert.equal(reported,true);

const standard = `// ==UserScript==
// @name Example Read Tools
// @namespace example-local-probe
// @version 0.2.4
// @match [https://editor.example.com/config/](https://editor.example.com/config/)
// @match [https://admin.example.com/tools/](https://admin.example.com/tools/)
// @run-at document-idle
// @inject-into page
// @grant none
// @noframes
// ==/UserScript==
// Body is unchanged, including [text](https://example.com/) in comments.
`;
const imported=prepareImport(standard,[]);
assert.match(imported.id,/^userscript-[a-f0-9]{16}$/);
assert.deepEqual(imported.matches,['https://editor.example.com/config/','https://admin.example.com/tools/']);
assert(!imported.source.includes('// @match ['));assert(imported.source.endsWith('// Body is unchanged, including [text](https://example.com/) in comments.\n'));
assert.equal(prepareImport(standard.replace('0.2.4','0.2.5'),[]).id,imported.id);
assert.notEqual(prepareImport(standard.replace('example-local-probe','another-namespace'),[]).id,imported.id);
assert.throws(()=>prepareImport(standard,[imported],imported.id,imported.source),/一致/);
assert.throws(()=>prepareImport(standard.replace('](https://admin.','](https://evil.'),[]),/不一致/);
const next=prepareImport(standard.replace('0.2.4','0.2.5'),[{...imported,enabled:false}],imported.id,imported.source,false);
assert.equal(next.enabled,false);assert.equal(next.previousSource,imported.source);
assert.equal(prepareImport(next.previousSource,[next],next.id,next.source).version,'0.2.4');
