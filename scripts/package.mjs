import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');
execFileSync(process.execPath,[join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const name=`webmcp-script-${version}`,out=join(root,'dist',name);
await mkdir(out);
for(const folder of ['extension','examples'])await cp(join(root,'dist',folder),join(out,folder),{recursive:true});
// A portable extension never embeds the publisher's filesystem paths or pairing credentials.
await writeFile(join(out,'extension/connection-config.json'),'null\n');
for(const file of ['setup.mjs','README.md','PRIVACY.md','SECURITY.md','LICENSE','THIRD_PARTY.md','SCRIPT_FORMAT.md','CHANGELOG.md','ROADMAP.md','CONTRIBUTING.md'])await cp(join(root,file),join(out,file));
await cp(join(root,'docs'),join(out,'docs'),{recursive:true});
await cp(join(root,'skills'),join(out,'skills'),{recursive:true});
await cp(join(root,'scripts/demo.mjs'),join(out,'demo.mjs'));
// The demo source normally reads from dist/examples; the release keeps examples beside it.
const demo=await readFile(join(out,'demo.mjs'),'utf8');
await writeFile(join(out,'demo.mjs'),demo.replaceAll('../dist/examples/','./examples/'));
await writeFile(join(out,'package.json'),JSON.stringify({name:'webmcp-script',version,type:'module',private:true,engines:{node:'>=22'}},null,2)+'\n');
for(const file of ['bridge/config.mjs','scripts/bundle-native.mjs']){
  await mkdir(dirname(join(out,file)),{recursive:true});await cp(join(root,file),join(out,file));
}
const bundled=await build({absWorkingDir:root,entryPoints:['bridge/server.mjs','bridge/relay.mjs','scripts/library.mjs'],outdir:out,outbase:root,
  outExtension:{'.js':'.mjs'},bundle:true,platform:'node',target:'node22',format:'esm',metafile:true,legalComments:'linked',
  // Preserve local module URLs and CLI entry guards; bundle only third-party imports.
  plugins:[{name:'local-modules',setup(builder){builder.onResolve({filter:/^\./},args=>{
    if(args.importer&&!/[\\/]node_modules[\\/]/.test(args.importer))return {path:args.path,external:true};
  });}}],
  external:['bufferutil','utf-8-validate'],banner:{js:"import {createRequire as createNodeRequire} from 'node:module'; const require=createNodeRequire(import.meta.url);"}});
const licenses=new Map();
for(const input of Object.keys(bundled.metafile.inputs).filter(p=>p.includes('node_modules/'))){
  let dir=dirname(resolve(root,input));
  while(dir!==dirname(dir)){
    try{
      const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
      if(!licenses.has(pkg.name))licenses.set(pkg.name,`${pkg.name} ${pkg.version}\n${await readFile(join(dir,'LICENSE'),'utf8')}`);
      break;
    }catch(error){if(error.code!=='ENOENT')throw error;dir=dirname(dir);}
  }
}
await writeFile(join(out,'THIRD_PARTY_LICENSES.txt'),[...licenses.values()].join('\n\n'));
const files={};
for(const file of (await readdir(out,{recursive:true,withFileTypes:true})).filter(f=>f.isFile())){
  const path=join(file.parentPath,file.name),relative=path.slice(out.length+1);
  files[relative]=createHash('sha256').update(await readFile(path)).digest('hex');
}
await writeFile(join(out,'build.json'),JSON.stringify({version,files},null,2)+'\n');
const archive=join(root,'dist',name+'.zip');
execFileSync('zip',['-qr',archive,name],{cwd:join(root,'dist')});
await writeFile(join(root,'dist/SHA256SUMS.txt'),createHash('sha256').update(await readFile(archive)).digest('hex')+'  '+name+'.zip\n');
console.log(`Portable release: ${archive}`);
