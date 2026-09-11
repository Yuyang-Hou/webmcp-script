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

export function connectionInstructions(config) {
  return `请帮我连接本机 Chrome 的 WebMCP Script 扩展。
1. 先检查你是否已配置 webmcp-script MCP 服务。若未配置，请使用下面的本机 stdio 配置，保留其他已有服务；若客户端无法由你配置，请给我该客户端的具体操作步骤。
${JSON.stringify(config,null,2)}
2. 服务加载后，调用 connection_info。若已有服务缺少该工具，请重新连接该 MCP 服务加载新版，不要重复添加服务。这会启动本机桥接，不需要先连接 Chrome 扩展。将返回的 pairingCode 原样放在代码块中交给我，我会粘贴到扩展的“连接”页。连接码只用于本机配对，不要提交到仓库或公开分享。
3. 我确认已粘贴后，调用 pages 检查是否能发现 Chrome 页面，并如实报告结果。此任务仅授权配置连接和只读发现，不授权调用网站的业务写工具。`;
}
