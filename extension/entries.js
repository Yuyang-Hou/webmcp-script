export function matchesURL(pattern, url) {
  const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  let u; try { u = new URL(url); } catch { return false; }
  const host = m[2].toLowerCase();
  return (m[1] === '*' ? ['http:', 'https:'].includes(u.protocol) : u.protocol === m[1] + ':') &&
    (host === '*' || host === u.hostname || host.startsWith('*.') && (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1)))) &&
    new RegExp('^' + m[3].split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(u.pathname + u.search);
}

const fail = message => {throw Error('入口声明：'+message);};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(value) && value !== '.' && value !== '..';
function fields(value, allowed) {
  if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('字段不合法');
}
function entryURL(template, values, matches) {
  const url=template.replace(/\{([a-z][A-Za-z0-9_]{0,31})\}/g,(_,key)=>{
    if(!Object.hasOwn(values,key)||!identifier(values[key]))fail(`参数 ${key} 必须是 1–200 字符的标识符`);
    return encodeURIComponent(values[key]);
  });
  let parsed;try {parsed=new URL(url);}catch{fail('URL 无效');}
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.href.length>2048||/[{}*]/.test(url))fail('仅支持无凭据、无通配符的 HTTP(S) 入口');
  if(!matches.some(pattern=>matchesURL(pattern,parsed.href)))fail('URL 不属于脚本 @match 范围');
  return parsed.href;
}
export function parseEntries(lines, matches) {
  if(lines.length>12)fail('最多声明 12 个入口');
  const ids=new Set();
  return lines.map(line=>{
    let entry;try{entry=JSON.parse(line);}catch{fail('@webmcp-entry 必须是一行 JSON');}
    fields(entry,['id','title','url','parameters']);
    if(typeof entry.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(entry.id)||ids.has(entry.id))fail('入口 id 无效或重复');ids.add(entry.id);
    if(typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>200)fail('缺少入口说明');
    if(typeof entry.url!=='string'||entry.url.length>2048)fail('URL 过长或缺失');
    const authority=entry.url.match(/^https?:\/\/([^/]+)\//)?.[1];
    if(!authority||/[{}*]/.test(authority))fail('域名和端口必须固定，参数只能出现在路径、query 或 hash 中');
    const params=entry.parameters??{};
    if(!object(params)||Object.keys(params).length>8)fail('parameters 最多 8 项');
    const placeholders=[...new Set([...entry.url.matchAll(/\{([a-z][A-Za-z0-9_]{0,31})\}/g)].map(m=>m[1]))];
    if(/[{}]/.test(entry.url.replace(/\{([a-z][A-Za-z0-9_]{0,31})\}/g,'')))fail('占位符格式不合法');
    if(placeholders.length!==Object.keys(params).length||placeholders.some(key=>!Object.hasOwn(params,key)))fail('参数与 URL 占位符必须一一对应');
    const examples=Object.create(null);
    for(const [key,spec] of Object.entries(params)) {
      fields(spec,['description','example','enum']);
      if(typeof spec.description!=='string'||!spec.description.trim()||spec.description.length>300||!identifier(spec.example))fail(`参数 ${key} 需要说明和有效 example`);
      if(spec.enum!==undefined&&(!Array.isArray(spec.enum)||!spec.enum.length||spec.enum.length>30||spec.enum.some(v=>!identifier(v))||!spec.enum.includes(spec.example)))fail(`参数 ${key} 的 enum 不合法`);
      examples[key]=spec.example;
    }
    entryURL(entry.url,examples,matches);
    return {...entry,parameters:params};
  });
}
export function resolveEntry(script, entryId, parameters) {
  if(!script.enabled)fail('脚本已停用，不能将入口视为可用');
  const entry=script.entries.find(item=>item.id===entryId);
  if(!entry)fail('入口不存在，请重新查询 browser_catalog');
  if(!object(parameters)||Object.keys(parameters).some(key=>!Object.hasOwn(entry.parameters,key)))fail('参数字段不匹配');
  for(const [key,spec] of Object.entries(entry.parameters)) {
    if(!Object.hasOwn(parameters,key)||!identifier(parameters[key]))fail(`缺少或无效参数 ${key}`);
    if(spec.enum&&!spec.enum.includes(parameters[key]))fail(`参数 ${key} 不在 enum 中`);
  }
  return {scriptId:script.id,version:script.version,entryId:entry.id,url:entryURL(entry.url,parameters,script.matches),
    nextStep:'用 visit_page 直接打开该 URL，再 inspect/describe 原生工具。解析链接不证明项目存在、登录成功或工具已就绪。'};
}
