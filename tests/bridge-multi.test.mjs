import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
test('concurrent MCP clients share a relay, isolate responses and release it when idle',async()=>{
  const port=17932,token='multi-client-test-token-000000000000000000000';
  const env={...process.env,WEBMCP_PORT:String(port),WEBMCP_TOKEN:token,WEBMCP_IDLE_MS:'600'};
  const make=()=>new Client({name:'multi-client-test',version:'1.0.0'});
  const a=make(),b=make();let extension;
  const transport=()=>new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bridge/server.mjs',import.meta.url))],env,stderr:'pipe'});
  try {
    await Promise.all([a.connect(transport()),b.connect(transport())]);
    await Promise.all([a.callTool({name:'pages',arguments:{}}),b.callTool({name:'pages',arguments:{}})]);
    const denied=new WebSocket(`ws://127.0.0.1:${port}/client`,{headers:{Origin:'https://evil.invalid',Authorization:`Bearer ${token}`,'X-WebMCP-Protocol':'1'}});
    await assert.rejects(once(denied,'open'));
    extension=new WebSocket(`ws://127.0.0.1:${port}/extension?token=${token}`,{origin:'chrome-extension://'+'b'.repeat(32)});await once(extension,'open');
    const received=[];let both;const waiting=new Promise(resolve=>both=resolve);
    extension.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type)return;received.push(msg);if(received.length===2)both();});
    const left=a.callTool({name:'call_tool',arguments:{pageId:1,revision:'r1',name:'read',input:{owner:'left'}}});
    const leftClosed=left.then(()=>false,()=>true);
    const right=b.callTool({name:'call_tool',arguments:{pageId:1,revision:'r1',name:'read',input:{owner:'right'}}});
    await waiting;assert.notEqual(received[0].id,received[1].id);
    await a.close();assert.equal(await leftClosed,true);
    for(const request of received)extension.send(JSON.stringify({id:request.id,result:{owner:request.params.input.owner}}));
    const result=await right;assert.equal(JSON.parse(result.content[0].text).owner,'right');
    assert.equal(extension.readyState,WebSocket.OPEN);
    const closed=once(extension,'close');await b.close();await closed;
    const gone=new WebSocket(`ws://127.0.0.1:${port}/client`);
    await assert.rejects(once(gone,'open'),/ECONNREFUSED/);
  } finally {extension?.terminate();await Promise.allSettled([a.close(),b.close()]);}
});
