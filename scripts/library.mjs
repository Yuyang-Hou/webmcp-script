import {realpathSync} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm,stat,readdir,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {Script} from 'node:vm';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseScript,prepareImport} from '../extension/metadata.js';
import {bundleNative} from './bundle-native.mjs';
const exec=promisify(execFile),digest=value=>createHash('sha256').update(value).digest('hex');
const defaultRoot=fileURLToPath(new URL('../.local/library/',import.meta.url));
const fingerprint=scripts=>digest(JSON.stringify(scripts.map(({id,source,enabled})=>({id,source,enabled})).sort((a,b)=>a.id.localeCompare(b.id))));
const summary=({source,previousSource,...script})=>({...script,sha256:digest(source),canRestore:!!previousSource});
async function hashes(directory){
  const files={};
  for(const name of (await readdir(directory,{recursive:true})).sort()){
    const path=join(directory,name),info=await lstat(path);
    if(info.isSymbolicLink())throw Error('构建目录不能包含符号链接');
    if(info.isFile())files[name]=digest(await readFile(path));
  }
  return files;
}
async function inspectFile(path){
  if((await stat(path)).size>1024*1024)throw Error('脚本应小于 1 MB');
  const script=parseScript(await readFile(path,'utf8'));
  new Script(`(async()=>{\n${script.source}\n})`); // Syntax only; no imported code executes here.
  return script;
}
function view(state){
  const selected=state.builds.find(b=>b.id===state.selectedBuild);
  return {revision:state.revision,scripts:state.scripts.map(summary),builds:state.builds,selectedBuild:selected||null,
    pendingChanges:!selected||selected.fingerprint!==fingerprint(state.scripts),lastLaunchRequest:state.lastLaunchRequest||null,
    pageVerification:'unknown: use native page tool discovery; a build or launch receipt is not proof of injection'};
}
export async function manageLibrary(action,args={},directory=process.env.WEBMCP_LIBRARY_DIR||defaultRoot){
  const root=resolve(directory),statePath=join(root,'state.json');
  const load=async()=>{try{const s=JSON.parse(await readFile(statePath,'utf8'));if(s.format!==1)throw Error('不支持的脚本库格式');return s;}catch(e){if(e.code!=='ENOENT')throw e;return {format:1,revision:0,scripts:[],builds:[],selectedBuild:null};}};
  if(action==='status')return view(await load());
  if(action==='preview'){
    const script=await inspectFile(args.path),state=await load(),old=state.scripts.find(s=>s.id===script.id);
    return {revision:state.revision,script:summary(script),source:script.source,previous:old?summary(old):null};
  }
  if(!['import','enable','disable','remove','restore','build','select','launch'].includes(action))throw Error('未知脚本库操作');
  if(!Number.isInteger(args.expectedRevision)||args.expectedRevision<0)throw Error('需要 status / preview 返回的 expectedRevision');
  await mkdir(root,{recursive:true,mode:0o700});
  const lock=join(root,'.lock');
  try{await mkdir(lock);}catch(e){if(e.code==='EEXIST')throw Error('脚本库正被其他任务修改；请稍后重新读取状态');throw e;}
  try {
    const state=await load();if(state.revision!==args.expectedRevision)throw Error('STALE_REVISION: 脚本库已变化，请重新读取状态');
    let result;
    if(action==='import'){
      const candidate=await inspectFile(args.path);
      if(digest(candidate.source)!==args.sha256)throw Error('源码与预览不一致，请重新 preview');
      const old=state.scripts.find(s=>s.id===candidate.id);
      const script=prepareImport(candidate.source,state.scripts,old?.id,old?.source,old?.enabled);
      state.scripts=[...state.scripts.filter(s=>s.id!==script.id),script];
    } else if(['enable','disable','remove','restore'].includes(action)) {
      const script=state.scripts.find(s=>s.id===args.id);if(!script)throw Error('脚本不存在');
      if(action==='remove'){
        await mkdir(join(root,'removed'),{recursive:true,mode:0o700});
        const archive=join(root,'removed',randomUUID()+'.user.js');await writeFile(archive,script.source,{mode:0o600,flag:'wx'});
        state.scripts=state.scripts.filter(s=>s.id!==args.id);result={archivedSource:archive};
      } else if(action==='restore') {
        if(!script.previousSource)throw Error('没有可恢复的上一版');
        const restored=prepareImport(script.previousSource,state.scripts,script.id,script.source,script.enabled);
        state.scripts=state.scripts.map(s=>s.id===script.id?restored:s);
      } else script.enabled=action==='enable';
    } else if(action==='build') {
      const id=randomUUID(),buildRoot=join(root,'builds',id),inputRoot=join(buildRoot,'sources');
      await mkdir(inputRoot,{recursive:true,mode:0o700});
      const paths=[];
      for(const script of state.scripts.filter(s=>s.enabled)){const path=join(inputRoot,script.id+'.user.js');await writeFile(path,script.source,{mode:0o600});paths.push(path);}
      const extensionPath=join(buildRoot,'extension');
      // An empty library still produces an installable package which registers no tools.
      if(paths.length)await bundleNative(paths,extensionPath);
      else {await mkdir(extensionPath);await writeFile(join(extensionPath,'manifest.json'),JSON.stringify({manifest_version:3,name:'WebMCP Script · Native Bundle',version:'0.4.0',description:'没有启用脚本'}));}
      const build={id,extensionPath,fingerprint:fingerprint(state.scripts),files:await hashes(extensionPath),createdAt:new Date().toISOString(),scripts:state.scripts.filter(s=>s.enabled).map(summary)};
      state.builds.push(build);result={build};
    } else if(action==='select') {
      const build=state.builds.find(b=>b.id===args.buildId);if(!build)throw Error('构建不存在');
      if(JSON.stringify(await hashes(build.extensionPath))!==JSON.stringify(build.files))throw Error('构建内容已变化，请重新 build');
      state.selectedBuild=args.buildId;result={selectedForNextLaunch:true};
    } else if(action==='launch') {
      if(process.platform!=='darwin')throw Error('Codex 隔离启动目前仅支持 macOS');
      const build=state.builds.find(b=>b.id===state.selectedBuild);if(!build)throw Error('请先 build 并 select');
      if(build.fingerprint!==fingerprint(state.scripts))throw Error('还有未应用修改；请 build 并 select 当前脚本库');
      if(JSON.stringify(await hashes(build.extensionPath))!==JSON.stringify(build.files))throw Error('构建内容已变化，请重新 build');
      const plist='/Applications/ChatGPT.app/Contents/Info.plist';
      const readPlist=async key=>(await exec('/usr/bin/plutil',['-extract',key,'raw','-o','-',plist])).stdout.trim();
      const version=await readPlist('CFBundleShortVersionString'),number=await readPlist('CFBundleVersion');
      if(!/^[\w.-]+$/.test(version+number))throw Error('无法确定 Codex 版本');
      const app=join(homedir(),'Library/Application Support/Codex-WebMCP/Runtime',`ChatGPT-${version}-${number}.app`);
      try{await exec('/usr/bin/codesign',['--verify','--deep','--strict',app]);}catch{throw Error('缺少当前版本的签名隔离副本；先运行 AnyWebMCP 本机启动器初始化');}
      const profile=join(root,'profile');
      const rows=(await exec('/bin/ps',['-axo','pid=,command='])).stdout.split('\n');
      const running=rows.filter(row=>row.includes('/Contents/MacOS/ChatGPT ')&&(row.includes(`--user-data-dir=${profile} `)||row.trimEnd().endsWith(`--user-data-dir=${profile}`)));
      if(running.length)return {...view(state),restartRequired:true,pids:running.map(r=>Number(r.trim().split(/\s/,1)[0])),message:'专用 Codex 已运行。请先按用户授权正常退出后再 launch；本工具不会自动关闭工作。'};
      await mkdir(profile,{recursive:true,mode:0o700});
      await exec('/usr/bin/open',['-n',app,'--args',`--user-data-dir=${profile}`,`--load-extension=${build.extensionPath}`,'--enable-features=WebMCPTesting']);
      state.lastLaunchRequest={buildId:build.id,at:new Date().toISOString(),profile,status:'requested; native page verification required'};
      result={launchRequested:true};
    }
    state.revision++;
    const temp=join(root,'state-'+randomUUID()+'.tmp');
    try{await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,statePath);}
    catch(error){if(result?.launchRequested)throw Error(`启动已请求，但记录失败：${error.message}。结果未知，请勿自动重试启动。`);throw error;}
    finally{await rm(temp,{force:true});}
    return {...view(state),...result};
  } finally {await rm(lock,{recursive:true,force:true});}
}

if(process.argv[1] && realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [action='status',json='{}']=process.argv.slice(2);
  try{console.log(JSON.stringify(await manageLibrary(action,JSON.parse(json)),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
