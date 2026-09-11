export const $ = id => document.getElementById(id);
export async function send(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply) throw Error('扩展后台未响应，请重载扩展后重试');
  if (reply.error) throw Error(reply.error.message);
  return reply.result;
}
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function discovery(page) {
  if (!page) return {ready:false, text:'无法读取页面'};
  if (page.error) return {ready:false, text:`读取失败：${page.error}`};
  if (page.implementation !== 'native-0.4') return {ready:false, text:'需要更新页面连接，请刷新网页后重试'};
  if (!page.native) return {ready:false, text:'浏览器未提供原生 WebMCP 接口'};
  return {ready:true, text:`${page.tools.length} 个工具`};
}
export function matchesURL(pattern, url) {
  const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  let u; try { u = new URL(url); } catch { return false; }
  const host = m[2].toLowerCase();
  return (m[1] === '*' ? ['http:', 'https:'].includes(u.protocol) : u.protocol === m[1] + ':') &&
    (host === '*' || host === u.hostname || host.startsWith('*.') && (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1)))) &&
    new RegExp('^' + m[3].split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(u.pathname + u.search);
}
export function connection(state) {
  return state.bridgeStatus === '已连接' ? '本地服务已连接' : state.bridgeStatus;
}
export function toolSource(tool) {
  if(tool.source?.kind==='script')return `脚本 · ${tool.source.name||tool.source.id}`;
  return tool.source?.kind==='page'?'页面提供':'来源未确认';
}
export function icon(name) {
  const paths={tools:'M8 4H5a2 2 0 0 0-2 2v3l-2 3 2 3v3a2 2 0 0 0 2 2h3m8-16h3a2 2 0 0 1 2 2v3l2 3-2 3v3a2 2 0 0 1-2 2h-3',script:'M14 3H5v18h14V8z M14 3v5h5 M8 12l-2 2 2 2m6-4 2 2-2 2',plus:'M12 5v14M5 12h14',panel:'M3 4h18v16H3zM3 9h18M9 9v11',edit:'M14 5l5 5M4 20l5-1L21 7l-5-5L4 14z',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',check:'M5 12l4 4L19 6',chevron:'M10 7l5 5-5 5',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:`menu-icon icon-${name}`}))svg.setAttribute(key,value);
  path.setAttribute('d',paths[name]);svg.append(path);return svg;
}
