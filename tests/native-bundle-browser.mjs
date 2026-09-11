import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,access,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {bundleNative} from '../scripts/bundle-native.mjs';
import {createScriptTemplate,parseScript} from '../extension/metadata.js';
const root=resolve(import.meta.dirname,'..');
try{await access(resolve(root,'../../work/browser-test/browsers'));process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(root,'../../work/browser-test/browsers');}catch{}
const {chromium}=await import('playwright');
const work=await mkdtemp(join(tmpdir(),'webmcp-native-browser-')),extension=join(work,'extension');
const plain=join(work,'native.user.js');
const template=createScriptTemplate().replace('https://example.com/*','http://127.0.0.1/*');
const templateTool=template.match(/name: '(read_title_[^']+)'/)[1];
await writeFile(plain,template);
await bundleNative([resolve(root,'examples/local-demo.user.js'),plain],extension);
// This site serves no scripts: all tools must come from the installed extension package.
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Native bundle test</title><p>Plain page without scripts</p>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;let context;
const checks=[];
try {
 context=await chromium.launchPersistentContext(join(work,'profile'),{channel:'chromium',headless:false,args:['--enable-features=WebMCPTesting',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const page=await context.newPage();
 const inspect=()=>page.evaluate(async()=> (await document.modelContext.getTools()).map(t=>t.name).sort());
 for(const path of ['/','/second']) {
  await page.goto(`http://127.0.0.1:${port}${path}`);
  await page.waitForFunction(async()=> (await document.modelContext?.getTools())?.length===3);
  assert.deepEqual(await inspect(),['local-demo__read_page','local-demo__sum',templateTool].sort());
  assert.equal(await page.evaluate(async name=>{const tool=(await document.modelContext.getTools()).find(t=>t.name===name);return document.modelContext.executeTool(tool,'{}');},templateTool),'Native bundle test');
  assert.equal(JSON.parse(await page.evaluate(async()=>{const tool=(await document.modelContext.getTools()).find(t=>t.name==='local-demo__sum');return document.modelContext.executeTool(tool,JSON.stringify({a:2,b:3}));})).sum,5);
  checks.push(`automatic native discovery and invocation on ${path}`);
 }
 const scriptId=parseScript(template).id;
 const owned=await page.evaluate(async()=>WebMCPScript.snapshot());
 assert.equal(owned.tools.find(t=>t.name===templateTool).source.id,scriptId);
 assert.equal(owned.tools.find(t=>t.name==='local-demo__sum').source.id,'local-demo');
 await page.evaluate(async name=>{
   window.oldTool=(await document.modelContext.getTools()).find(t=>t.name===name);
   await document.modelContext.registerTool({name:'website_owned',description:'Site',inputSchema:{type:'object'},execute:()=> 'website'});
 },templateTool);
 await page.evaluate(id=>WebMCPScript.request('remove',{id}),scriptId);
 assert.deepEqual(await inspect(),['local-demo__read_page','local-demo__sum','website_owned']);
 await assert.rejects(page.evaluate(()=>document.modelContext.executeTool(window.oldTool,'{}')));
 await page.evaluate(()=>WebMCPScript.request('remove',{id:'local-demo'}));
 assert.deepEqual(await inspect(),['website_owned']);
 assert.equal(await page.evaluate(async()=>document.modelContext.executeTool((await document.modelContext.getTools())[0],'{}')),'website');
 checks.push('native provider attribution, immediate script removal, stale native handle rejection and unaffected website tools');
 await page.reload();await page.waitForFunction(async()=> (await document.modelContext.getTools()).length===3);checks.push('refresh keeps exactly one registration per tool');
 await context.close();context=null;
 context=await chromium.launchPersistentContext(join(work,'profile'),{channel:'chromium',headless:false,args:['--enable-features=WebMCPTesting',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const restarted=await context.newPage();await restarted.goto(`http://127.0.0.1:${port}/`);
 await restarted.waitForFunction(async()=> (await document.modelContext?.getTools())?.length===3);checks.push('browser restart restores packaged scripts automatically');
 const evidence=process.env.BROWSER_EVIDENCE_DIR||resolve(root,'../browser-evidence');await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,'native-bundle-browser.json'),JSON.stringify({browser:context.browser().version(),checks,source:'HTTP page without scripts',bundle:JSON.parse(await readFile(join(extension,'bundle.json'),'utf8')),managementPageAccess:false},null,2)+'\n');
 console.log(JSON.stringify({checks,work}));
} finally {await context?.close();server.close();}
