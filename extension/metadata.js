export function parseScript(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) throw Error('脚本应小于 1 MB');
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) throw Error('缺少 UserScript 元数据');
  const get = key => [...block[1].matchAll(new RegExp('^\\s*//\\s*@' + key + '\\s+(.+)$','gm'))].map(m => m[1].trim());
  const [explicitId] = get('id'), [name] = get('name'), [version] = get('version'), [namespace = ''] = get('namespace');
  if (!name) throw Error('缺少 @name（脚本名称）');
  if (!version) throw Error('缺少 @version（脚本版本）');
  const unwrap = value => {
    const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!link) return value;
    if (link[1] !== link[2]) throw Error('@match 的链接文字与地址不一致，请改为一个明确的纯文本网址');
    return link[2];
  };
  const matches = get('match').map(unwrap);
  if (!matches.length) throw Error('缺少 @match（脚本运行的网站范围）');
  if (matches.some(p => !/^(https?|\*):\/\/(\*|\*\.[a-z\d.-]+|[a-z\d.-]+)\/[^\s]*$/i.test(p))) throw Error('@match 仅支持 HTTP(S) Chrome 匹配格式，不包含端口');
  if (get('require').length || get('grant').some(g => g !== 'none')) throw Error('暂不支持 @require 或特权 @grant');
  if (explicitId && !/^[a-zA-Z][\w-]{0,63}$/.test(explicitId)) throw Error('@id 格式无效：须以字母开头，最多 64 个字母、数字、下划线或连字符；也可以删除此字段自动生成');
  // A stable local identity, not a security token or content fingerprint.
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify([namespace, name]))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  const id = explicitId || `userscript-${hash.toString(16).padStart(16, '0')}`;
  const header = block[0].replace(/^(\s*\/\/\s*@match[ \t]+)([^\r\n]+)$/gm, (_, prefix, value) => prefix + unwrap(value.trim()));
  source = source.slice(0, block.index) + header + source.slice(block.index + block[0].length);
  return {id,name,namespace,version,matches,source,enabled:true};
}

export function prepareImport(source, scripts, replace, expectedSource, expectedEnabled) {
  const script = parseScript(source), old = scripts.find(item => item.id === script.id);
  if (old && !replace) throw Error('该 ID 已安装，请从脚本列表打开后编辑');
  if (replace && (replace !== script.id || !old)) throw Error('替换目标已变化，请刷新后重新预览');
  if (old && expectedSource !== old.source) throw Error('脚本已在其他窗口更新，请重新预览');
  if (old && expectedEnabled !== undefined && old.enabled !== expectedEnabled) throw Error('脚本启停状态已变化，请重新预览');
  if (old && old.source === script.source) throw Error('源码与当前版本一致，无需替换');
  return {...script, enabled:old?.enabled ?? true, ...(old ? {previousSource:old.source} : {})};
}


export function createScriptTemplate() {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `// ==UserScript==
// @name 新建用户脚本
// @namespace local-${suffix}
// @version 0.1.0
// @description 为网站添加 WebMCP 工具
// @match https://example.com/*
// @run-at document-idle
// @inject-into page
// @grant none
// @noframes
// ==/UserScript==

// 将上面的 @match 改为目标网站，在 execute 中编写工具逻辑。
(() => {
  'use strict';
  if (window.top !== window) return;
  if (!document.modelContext?.registerTool) {
    console.warn('当前浏览器未提供原生 WebMCP 接口');
    return;
  }

  let controller;
  async function register() {
    const registration = new AbortController();
    controller = registration;
    try {
      await document.modelContext.registerTool({
        name: 'read_title_${suffix}',
        description: '读取当前页面标题，不修改页面。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => document.title
      }, { signal: registration.signal });
    } catch (error) {
      registration.abort();
      console.error('WebMCP 工具注册失败', error);
    }
  }

  window.addEventListener('pagehide', () => controller?.abort());
  window.addEventListener('pageshow', event => { if (event.persisted) void register(); });
  void register();
})();
`;
}
