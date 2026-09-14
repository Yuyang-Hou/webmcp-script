// Real unpacked extension and stdio MCP acceptance in an isolated Chromium profile.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=resolve(import.meta.dirname,'..'),profile=await mkdtemp(join(tmpdir(),'webmcp-catalog-'));
const server=createServer((_req,res)=>res.end('<title>Catalog acceptance</title>'));
server.listen(0,'127.0.0.1');await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}/`;
const client=new Client({name:'catalog-acceptance',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'bridge/server.mjs')],env:{...process.env,WEBMCP_PORT:process.env.TEST_PORT||'17961',WEBMCP_TOKEN:'isolated-catalog-acceptance-token',WEBMCP_IDLE_MS:'1000'},stderr:'pipe'});
let browser;
async function call(name,args={}){const result=await client.callTool({name,arguments:args});if(result.isError)throw Error(result.content[0].text);return JSON.parse(result.content[0].text);}
async function until(fn){for(let i=0;i<60;i++){try{return await fn();}catch(error){if(i===59)throw error;await new Promise(r=>setTimeout(r,200));}}}
try {
  await client.connect(transport);
  const {pairingCode}=await call('connection_info');
  browser=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,args:['--enable-features=WebMCPTesting',`--disable-extensions-except=${join(root,'dist/extension')}`,`--load-extension=${join(root,'dist/extension')}`]});
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');
  worker.on('console',message=>{if(message.type()==='error')console.error('extension:',message.text());});
  const id=new URL(worker.url()).host;
  const settings=await browser.newPage();await settings.goto('chrome://extensions/?id='+id);
  const permission=settings.locator('#allow-user-scripts cr-toggle');await permission.waitFor();
  if(!await permission.evaluate(e=>e.checked))await permission.click();
  const manager=await browser.newPage();manager.on('pageerror',e=>console.error('manager error:',e.message));await manager.goto(`chrome-extension://${id}/manager.html#connection-settings`);
  await until(async()=>assert.equal(await manager.locator('#script-count').innerText(),'0 个脚本'));
  await manager.locator('#token').fill(pairingCode);await manager.locator('#pair').click();
  assert.equal(await manager.locator('#pair-error').innerText(),'');
  await until(async()=>{try{return await call('browser_catalog');}catch(error){throw Error(error.message+' UI: '+await manager.locator('#connection-state').innerText()+' '+await manager.locator('#pair-error').innerText());}});
  await manager.locator('a[href="#settings"]').click();await manager.locator('#retry').click();
  const page=await browser.newPage();await page.goto(url);
  await manager.locator('#new-script').click();
  const source=`// ==UserScript==\n// @id catalog-acceptance\n// @name Catalog acceptance\n// @description Read-only test\n// @version 1\n// @match http://127.0.0.1/*\n// ==/UserScript==\ndocument.modelContext.registerTool({name:'catalog_read',description:'Read test',inputSchema:{type:'object',properties:{}},execute:()=> 'ok'});`;
  await manager.locator('.cm-content').fill(source);
  await manager.locator('#save').click();await manager.locator('#confirm-save').click();
  await until(async()=>assert.equal((await call('browser_catalog')).scripts.length,1));
  const {pages}=await call('pages');const target=pages.find(p=>p.url===url);assert(target);
  await call('browser_entry',{action:'save',name:'Acceptance test',pageId:target.pageId||target.id,url,expectedUrl:null});
  await page.close();
  const catalog=await call('browser_catalog',{query:'acceptance'});
  assert.equal(catalog.scripts[0].version,'1');assert.equal(catalog.entries[0].url,url);
  assert(!JSON.stringify(catalog).includes('source'));assert(!JSON.stringify(catalog).includes(pairingCode));
  const visited=await call('visit_page',{url:catalog.entries[0].url});
  const snapshot=await until(async()=>{const s=await call('inspect_page',{pageId:visited.pageId});assert(s.tools.some(t=>t.name==='catalog_read'));return s;});
  const args={pageId:visited.pageId,revision:snapshot.revision,name:'catalog_read'};
  await call('describe_tool',args);assert.equal((await call('call_tool',{...args,input:{}})).result,'ok');
  await assert.rejects(call('browser_entry',{action:'save',name:'Acceptance test',pageId:visited.pageId,url,expectedUrl:null}),/入口已变化/);
  await call('browser_entry',{action:'remove',name:'Acceptance test',expectedUrl:url});
  assert.equal((await call('browser_catalog')).entries.length,0);
  console.log('PASS: real Chrome UI install -> MCP catalog with closed page -> saved entry -> visit -> native describe/call -> stale-write rejection -> remove');
} finally {await client.close();await browser?.close();server.close();await rm(profile,{recursive:true,force:true});}
