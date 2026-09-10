import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..');
const work=resolve(root,'../../work/browser-test');
const evidence=resolve(root,'../browser-evidence');
await mkdir(evidence,{recursive:true});
const context=await chromium.launchPersistentContext(resolve(work,'profile'),{
  channel:'chromium',headless:false,
  args:[`--disable-extensions-except=${resolve(root,'extension')}`,`--load-extension=${resolve(root,'extension')}`]
});
try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();
  await page.goto('chrome://extensions/?id='+id);
  await page.locator('extensions-detail-view').waitFor();
  console.log(await page.locator('extensions-toggle-row').evaluateAll(es=>es.map(e=>({id:e.id,text:e.textContent}))));
  const permission=page.locator('#allow-user-scripts cr-toggle');if(!(await permission.evaluate(e=>e.checked)))await permission.click();
  const manager=await context.newPage();await manager.goto(`chrome-extension://${id}/manager.html`);
  console.log('preflight',await manager.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();try{return await chrome.userScripts.execute({target:{tabId:tab.id},world:'MAIN',js:[{code:'(() => {const = ;}); true'}]});}catch(e){return {error:e.message};}}));
  await page.screenshot({path:resolve(evidence,'extensions.png')});
  const data={version:context.browser()?.version(),id,url:page.url(),text:await page.locator('body').innerText()};
  await writeFile(resolve(evidence,'probe.json'),JSON.stringify(data,null,2));
  console.log(JSON.stringify(data,null,2));
} finally {await context.close();}
