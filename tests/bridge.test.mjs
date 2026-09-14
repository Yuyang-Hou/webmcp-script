import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

test('standard MCP discovery, authentication, invocation and disconnect', async () => {
  const token='test-token-only-000000000000000000000000';
  const port=17931;
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bridge/server.mjs',import.meta.url))],env:{...process.env,WEBMCP_TOKEN:token,WEBMCP_PORT:String(port)},stderr:'pipe'});
  const client=new Client({name:'acceptance',version:'0.1.0'});
  let ws;
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools;
    assert.deepEqual(tools.map(x=>x.name).sort(),['call_tool','connection_info','describe_tool','inspect_page','native_build','native_launch','native_select_build','pages','script_change','script_import','script_library_status','script_preview','visit_page']);
    const setup=await client.callTool({name:'connection_info',arguments:{}});
    assert(!setup.isError);
    assert.deepEqual(JSON.parse(JSON.parse(setup.content[0].text).pairingCode),{version:1,token,port});
    assert.equal((await client.callTool({name:'pages',arguments:{}})).isError,true);
    const bad = new WebSocket(`ws://127.0.0.1:${port}/extension?token=${token}`, {origin:'https://malicious.example'});
    await assert.rejects(once(bad,'open'));
    ws=new WebSocket(`ws://127.0.0.1:${port}/extension?token=${token}`, {origin:'chrome-extension://'+'a'.repeat(32)});
    await once(ws,'open');
    ws.on('message',raw=>{
      const req=JSON.parse(raw);
      if(req.method==='pages') ws.send(JSON.stringify({id:req.id,result:{method:'pages',pages:[{native:false,tools:[],errors:[]},{native:true,tools:[{name:'legacy'}],errors:[]},{native:true,implementation:'native-0.4',tools:[{name:'website_native'}],errors:[]}]}}));
      else if(req.method==='describe' && req.params.revision!=='r1') ws.send(JSON.stringify({id:req.id,error:{message:'STALE_REVISION'}}));
      else ws.send(JSON.stringify({id:req.id,result:{method:req.method,params:req.params,revision:'r1',tools:[{name:'read',description:'local only'}]}}));
    });
    const pages=await client.callTool({name:'pages',arguments:{}});
    const discovered=JSON.parse(pages.content[0].text).pages;
    assert.equal(discovered[0].discoveryStatus,'unsupported');assert.ok(discovered[0].errors.length);
    assert.equal(discovered[1].discoveryStatus,'unknown');assert.deepEqual(discovered[1].tools,[]);
    assert.equal(discovered[2].discoveryStatus,'available');assert.equal(discovered[2].tools[0].name,'website_native');
    assert.equal((await client.callTool({name:'describe_tool',arguments:{pageId:1,revision:'old',name:'read'}})).isError,true);
    const result=await client.callTool({name:'call_tool',arguments:{pageId:1,revision:'r1',name:'read',input:{q:'hello'}}});
    assert.deepEqual(JSON.parse(result.content[0].text).params.input,{q:'hello'});
    ws.close(); await once(ws,'close');
    assert.equal((await client.callTool({name:'pages',arguments:{}})).isError,true);
  } finally {ws?.terminate(); await client.close();}
});
