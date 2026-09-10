import {resolve} from 'node:path';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const cache=resolve(root,'../../work/browser-test/browsers');
try {await access(cache);process.env.PLAYWRIGHT_BROWSERS_PATH=cache;} catch {}
const {chromium}=await import('playwright');
await mkdir(resolve(root,'.local'),{recursive:true,mode:0o700});
const tokenPath=resolve(root,'.local/pairing-token');
let token;
try {token=(await readFile(tokenPath,'utf8')).trim();} catch(e) {if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('hex');await writeFile(tokenPath,token,{mode:0o600,flag:'wx'});}
const demo=spawn(process.execPath,['scripts/demo.mjs'],{cwd:root,stdio:'inherit'});
let context;
try {
  context=await chromium.launchPersistentContext(resolve(root,'.local/preview-profile'),{channel:'chromium',headless:false,args:[`--disable-extensions-except=${resolve(root,'dist/extension')}`,`--load-extension=${resolve(root,'dist/extension')}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const settings=await context.newPage();await settings.goto('chrome://extensions/?id='+id);
  const toggle=settings.locator('#allow-user-scripts cr-toggle');await toggle.waitFor();
  if(!(await toggle.evaluate(e=>e.checked)))await toggle.click();
  const page=await context.newPage();await page.goto('http://127.0.0.1:17892/');
  const manager=await context.newPage();await manager.goto(`chrome-extension://${id}/manager.html`);
  await manager.locator('nav a[href="#connection-settings"]').click();await manager.locator('#token').fill(token);await manager.locator('#pair').click();
  await manager.locator('#retry').click();await manager.locator('nav a[href="#library"]').click();
  await manager.locator('#refresh').click();
  await manager.waitForFunction(()=>document.querySelector('#scripts').textContent.trim().length>0);
  if(!(await manager.locator('#scripts [data-script-id="local-demo"]').count())){
    await manager.locator('#import').setInputFiles(resolve(root,'dist/examples/local-demo.user.js'));
    await manager.locator('#preview-dialog').waitFor();
    await manager.locator('#confirm-install').click();
  }
  await manager.locator('#scripts [data-script-id="local-demo"]').waitFor();
  await settings.close();
  console.log('验收浏览器已打开。请在 AI 客户端启用 mcp-config.example.json 中的标准 MCP 配置，桥接将自动连接。退出请按 Ctrl+C。');
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);context.once('close',resolve);});
} finally {await context?.close();demo.kill();}
