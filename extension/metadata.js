export function parseScript(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) throw Error('脚本应小于 1 MB');
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) throw Error('缺少 UserScript 元数据');
  const get = key => [...block[1].matchAll(new RegExp('^\\s*//\\s*@' + key + '\\s+(.+)$','gm'))].map(m => m[1].trim());
  const [id] = get('id'), [name] = get('name'), [version] = get('version'), matches = get('match');
  if (!/^[a-zA-Z][\w-]{0,63}$/.test(id || '') || !name || !version || !matches.length) throw Error('需要合法 @id、@name、@version 和 @match');
  if (matches.some(p => !/^(https?|\*):\/\/(\*|\*\.[a-z\d.-]+|[a-z\d.-]+)\/[^\s]*$/i.test(p))) throw Error('@match 仅支持 HTTP(S) Chrome 匹配格式，不包含端口');
  if (get('require').length || get('grant').some(g => g !== 'none')) throw Error('暂不支持 @require 或特权 @grant');
  return {id,name,version,matches,source,enabled:true};
}

export function prepareImport(source, scripts, replace, expectedSource, expectedEnabled) {
  const script = parseScript(source), old = scripts.find(item => item.id === script.id);
  if (old && !replace) throw Error('该 ID 已安装，请使用替换');
  if (replace && (replace !== script.id || !old)) throw Error('替换目标已变化，请刷新后重新预览');
  if (old && expectedSource !== old.source) throw Error('脚本已在其他窗口更新，请重新预览');
  if (old && expectedEnabled !== undefined && old.enabled !== expectedEnabled) throw Error('脚本启停状态已变化，请重新预览');
  if (old && old.source === source) throw Error('源码与当前版本一致，无需替换');
  return {...script, enabled:old?.enabled ?? true, ...(old ? {previousSource:old.source} : {})};
}
