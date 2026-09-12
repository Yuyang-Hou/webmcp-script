export function parsePairing(value, manualPort=17891) {
  const text=typeof value==='string'?value.trim():'';
  if(!text)throw Error('请先粘贴 AI 返回的连接码');
  let token=text,port=manualPort;
  if(text.startsWith('{')) {
    let data;try {data=JSON.parse(text);}catch {throw Error('连接码不完整，请复制 AI 返回的整段连接码');}
    if(data.version!==1)throw Error('连接码版本不支持，请让 AI 重新生成连接码');
    token=data.token;port=data.port;
  }
  if(typeof token!=='string'||token.length<32||token.length>512||/\s/.test(token))throw Error('连接码无效，请复制完整连接码，不要包含说明文字');
  port=Number(port);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('连接端口无效，请重新获取连接码');
  return {token,port};
}

export function connectionInstructions(config,version='0.4.0-beta.2') {
  const install=config ? `请使用下面的本机 stdio 配置：\n${JSON.stringify(config,null,2)}` :
    `请检查本机 Node.js 是否为 22 或更新版本，并找到已解压的 WebMCP Script 安装目录。运行其中的 node setup.mjs，获取此电脑的 stdio 配置；它只输出配置，不修改客户端，也不启动服务。如果尚未下载，请从 https://github.com/Yuyang-Hou/webmcp-script/releases/tag/v${version} 获取 webmcp-script-${version}.zip 并按 SHA256SUMS.txt 校验，解压到固定目录。此包自带依赖，不要运行 pnpm install 或编译。不要猜测文件路径；不能访问本机文件时请说明需要用户提供什么。`;
  return `请帮我连接本机 Chrome 的 WebMCP Script 扩展。
1. 先检查你是否已配置 webmcp-script MCP 服务。${install} 保留其他已有服务；已配置时核对是否指向本次安装，不要重复添加。若客户端无法由你配置，请给我该客户端的具体操作步骤。
2. 服务加载后，调用 connection_info。若已有服务缺少该工具，请重新连接该 MCP 服务加载新版，不要重复添加服务。这会启动本机桥接，不需要先连接 Chrome 扩展。将返回的 pairingCode 原样放在代码块中交给我，我会粘贴到扩展的“连接”页。连接码只用于本机配对，不要提交到仓库或公开分享。
3. 我确认已粘贴后，调用 pages 检查是否能发现 Chrome 页面，并如实报告结果。此任务仅授权配置连接和只读发现，不授权调用网站的业务写工具。`;
}

export function connectionChecks(state,pages) {
  const ready=pages.filter(p=>p.native===true&&p.implementation==='native-0.4'&&Array.isArray(p.tools));
  return [
    state.userScriptsAvailable?'用户脚本权限已就绪。':'尚未允许用户脚本：请在扩展详情开启“允许用户脚本”，然后重新检查。',
    state.bridgeStatus==='已连接'?'扩展已连接本机 MCP 服务；仍需让 AI 调用 pages 验证客户端连接。':
      state.bridgeStatus==='未配对'?'尚未配对：先把连接说明发给 AI，再粘贴它返回的连接码。':
      `本机服务尚未连通（${state.bridgeStatus}）：确认 AI 的 MCP 服务正在运行，使用同一安装目录生成的连接码。不要反复添加服务。`,
    !pages.length?'还没有可检查的普通网页，请打开 HTTP(S) 网站后重新检查。':
      `${ready.length} / ${pages.length} 个页面的原生 WebMCP 接口可用，发现 ${ready.reduce((n,p)=>n+p.tools.length,0)} 个工具。`+
      (ready.length<pages.length?' 部分页面不支持或无法读取，请在“网页工具”查看具体原因；没有接口时不要反复重装扩展。':'')
  ];
}
