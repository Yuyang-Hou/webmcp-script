import {parse} from 'acorn';
import {parseScript} from './metadata.js';

export const digest=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),b=>b.toString(16).padStart(2,'0')).join('');
export function updateURL(value) {
  if(typeof value!=='string'||value.length>2048)throw Error('更新地址无效或过长');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('更新地址须为无账号密码和片段的 HTTPS URL');
  return url.href;
}
export function validateSyntax(source) {
  try {parse(`(() => {\n${source}\n});`,{ecmaVersion:'latest',sourceType:'script'});}
  catch(error){throw Error(`新版脚本语法检查失败：${error.message}`);}
}
export function compareVersions(left,right) {
  const parse=value=>{
    if(typeof value!=='string'||value.length>100||!/^\d+(?:\.\d+)*(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z.-]+)?$/.test(value))throw Error('暂不支持此版本格式，请使用数字点分版本或 SemVer 预发布版本');
    const [core,pre]=value.split('+')[0].split(/-(.*)/s);
    return {core:core.split('.').map(BigInt),pre:pre?.split('.')};
  };
  const a=parse(left),b=parse(right);
  for(let i=0;i<Math.max(a.core.length,b.core.length);i++){const x=a.core[i]??0n,y=b.core[i]??0n;if(x!==y)return x>y?1:-1;}
  if(!a.pre&&!b.pre)return 0;if(!a.pre)return 1;if(!b.pre)return -1;
  for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){
    const x=a.pre[i],y=b.pre[i];if(x===y)continue;if(x===undefined)return -1;if(y===undefined)return 1;
    const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){if(BigInt(x)===BigInt(y))continue;return BigInt(x)>BigInt(y)?1:-1;}
    if(xn!==yn)return xn?-1:1;return x>y?1:-1;
  }
  return 0;
}
export async function fetchScript(url,fetcher=fetch) {
  let target=updateURL(url);const origin=new URL(target).origin;
  const signal=AbortSignal.timeout(8000);
  for(let hops=0;hops<4;hops++) {
    const response=await fetcher(target,{credentials:'omit',redirect:'manual',cache:'no-cache',referrerPolicy:'no-referrer',signal});
    if(response.type==='opaqueredirect')throw Error('更新地址发生重定向，请配置最终的 HTTPS 源码地址');
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');if(!location)throw Error('更新地址重定向缺少目标');
      target=updateURL(new URL(location,target).href);
      if(new URL(target).origin!==origin)throw Error('更新源跨站重定向，需确认并配置最终地址');
      continue;
    }
    if(!response.ok)throw Error(`下载失败 HTTP ${response.status}；私有源需要可直接访问的地址`);
    if(/text\/html/i.test(response.headers.get('content-type')||''))throw Error('更新地址返回了网页或登录页，请使用脚本源码地址');
    if(Number(response.headers.get('content-length'))>1024*1024)throw Error('更新文件超过 1 MB');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024)throw Error('更新文件超过 1 MB');chunks.push(value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  throw Error('更新地址重定向次数过多');
}
export function updateSettings(script) {
  const meta=parseScript(script.source);
  const check=meta.updateURL==='none'?'':meta.updateURL|| (meta.downloadURL==='none'?'':meta.downloadURL)||'';
  return script.updates??{mode:'manual',updateURL:check,downloadURL:meta.downloadURL==='none'?'':meta.downloadURL||check};
}
export async function inspectUpdate(script,fetcher=fetch) {
  const settings=updateSettings(script);
  if(!settings.updateURL||!settings.downloadURL)return {status:'no-source',message:'尚未设置更新来源'};
  const meta=parseScript(await fetchScript(settings.updateURL,fetcher));
  if(meta.id!==script.id)throw Error('更新源脚本 ID 与已安装脚本不一致');
  const comparison=compareVersions(meta.version,script.version);
  if(comparison<0)return {status:'older',latestVersion:meta.version,message:'更新源版本较旧，保留本机版本'};
  const next=settings.updateURL===settings.downloadURL?meta:parseScript(await fetchScript(settings.downloadURL,fetcher));
  if(next.id!==script.id||next.version!==meta.version)throw Error('元数据与下载源码的 ID 或版本不一致，请稍后重试');
  validateSyntax(next.source);
  const sha256=await digest(next.source),currentSha256=await digest(script.source);
  if(comparison===0)return {status:sha256===currentSha256?'current':'same-version-changed',latestVersion:next.version,sha256,message:sha256===currentSha256?'已是最新版本':'相同版本的源码不同，请核对本地修改或发布源'};
  const reasons=[];
  if(!settings.baselineSha256||settings.baselineSha256!==currentSha256)reasons.push('本地源码已修改或尚未建立更新基线');
  if(JSON.stringify([...next.matches].sort())!==JSON.stringify([...script.matches].sort()))reasons.push('脚本运行的网站范围变化');
  if(next.updateURL&&next.updateURL!==settings.updateURL||next.downloadURL&&next.downloadURL!==settings.downloadURL)reasons.push('新版声明的更新来源变化；现有来源不会自动切换');
  return {status:'available',latestVersion:next.version,sha256,reasons,source:next.source,message:reasons.length?'有新版，需确认差异后更新':'有新版'};
}
