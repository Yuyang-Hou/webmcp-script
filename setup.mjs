// Print this installation's MCP configuration; do not edit client settings or start services.
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
if(Number(process.versions.node.split('.')[0])<22)throw Error('需要 Node.js 22 或更新版本');
const entry=new URL('./bridge/server.mjs',import.meta.url);
await access(entry);
console.log(JSON.stringify({mcpServers:{'webmcp-script':{command:process.execPath,args:[fileURLToPath(entry)]}}},null,2));
