import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const {version} = JSON.parse(await readFile(new URL('package.json',root),'utf8'));
const runtime = await readFile(new URL('extension/runtime.js',root),'utf8');
for (const [source,name] of [['demo.source.js','local-demo.user.js'],['route-demo.source.js','route-demo.user.js']]) {
  const code = await readFile(new URL('examples/'+source,root),'utf8');
  const marker='// ==/UserScript==';
  const end=code.indexOf(marker)+marker.length;
  if(end<marker.length) throw new Error('Missing userscript metadata: '+source);
  await writeFile(new URL('examples/'+name,root),code.slice(0,end)+'\n'+runtime+'\n'+code.slice(end));
}
await rm(dist, {recursive:true,force:true});
await mkdir(dist, { recursive:true });
for (const folder of ['extension','examples']) await cp(new URL(folder,root),new URL(folder+'/',dist),{recursive:true});
const files = [];
async function walk(dir, prefix='') {
  for (const item of await readdir(dir,{withFileTypes:true})) {
    const path=prefix+item.name;
    if(item.isDirectory()) await walk(new URL(item.name+'/',dir),path+'/');
    else if(path!=='build.json') files.push({path,sha256:createHash('sha256').update(await readFile(new URL(item.name,dir))).digest('hex')});
  }
}
await walk(dist);
await writeFile(new URL('build.json',dist),JSON.stringify({version,builtAt:new Date().toISOString(),node:process.version,files},null,2)+'\n');
console.log('Built dist/extension and dist/examples with SHA-256 manifest.');
