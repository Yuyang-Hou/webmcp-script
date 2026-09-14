import {realpathSync} from 'node:fs';
import {mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {createHash} from 'node:crypto';
import {parseScript} from '../extension/metadata.js';

// A generated, reviewed extension package: no browser storage or userScripts permission changes.
export async function bundleNative(paths, output) {
  if(!paths.length)throw Error('至少提供一个独立 .user.js 文件');
  const scripts=await Promise.all(paths.map(async path=>parseScript(await readFile(path,'utf8'))));
  if(new Set(scripts.map(s=>s.id)).size!==scripts.length)throw Error('脚本 ID 重复');
  const runtime=await readFile(new URL('../extension/runtime.js',import.meta.url),'utf8');
  const files=scripts.map(script=>{
    // Keep script source standard; the loader attaches native registration ownership.
    const code=`(async () => {
const started=Date.now();
while(!document.modelContext?.registerTool && Date.now()-started<30000) await new Promise(r=>setTimeout(r,250));
if(!document.modelContext?.registerTool) throw Error('原生 WebMCP 不可用');
const endScript=globalThis.WebMCPScript.beginScript(${JSON.stringify(script.id)},${JSON.stringify(script.name)});
try {
const WebMCPScript={...globalThis.WebMCPScript,install(spec){
if(spec.id!==${JSON.stringify(script.id)})throw Error('脚本 ID 与元数据不一致');
globalThis.WebMCPScript.install({...spec,matches:${JSON.stringify(script.matches)}});
}};
${script.source}
} finally {endScript();}
})().catch(error=>console.error('WebMCP Script:',error));
//# sourceURL=webmcp-script-${script.id}.user.js\n`;
    new Script(code,{filename:script.id+'.js'}); // Parse only; never run imported code in Node.
    return {name:'scripts/'+script.id+'.js',code};
  });
  const manifest={manifest_version:3,name:'WebMCP Script · Native Bundle',version:'0.4.0',
    description:'由独立脚本生成的原生 WebMCP 扩展',
    icons:{16:'icons/icon-16.png',32:'icons/icon-32.png',48:'icons/icon-48.png',128:'icons/icon-128.png'},
    content_scripts:scripts.map((s,i)=>({matches:s.matches,js:['runtime.js',files[i].name],world:'MAIN',run_at:'document_idle'}))};
  // Refuse an existing output: failed imports cannot overwrite a working installation.
  await mkdir(output,{recursive:false});
  try {
    await mkdir(join(output,'scripts'));
    await cp(new URL('../extension/icons/',import.meta.url),join(output,'icons'),{recursive:true});
    await writeFile(join(output,'runtime.js'),runtime);
    for(const file of files)await writeFile(join(output,file.name),file.code);
    await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    await writeFile(join(output,'bundle.json'),JSON.stringify({format:1,scripts:scripts.map(({id,name,version,matches,source})=>({id,name,version,matches,sha256:createHash('sha256').update(source).digest('hex')}))},null,2)+'\n');
  } catch(error){await rm(output,{recursive:true,force:true});throw error;}
  return manifest;
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [output,...paths]=process.argv.slice(2);
  if(!output||!paths.length)throw Error('用法：node scripts/bundle-native.mjs <新输出目录> <脚本.user.js> [...]');
  await bundleNative(paths,resolve(output));
  console.log('原生扩展包已生成：'+resolve(output));
}
