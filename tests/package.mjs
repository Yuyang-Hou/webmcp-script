import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,access,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=resolve(import.meta.dirname,'..'),{version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const temp=await mkdtemp(join(tmpdir(),'webmcp-portable-')),folder=join(temp,`webmcp-script-${version}`);
let client,ws,demo;
try{
  const checksum=(await readFile(join(root,'dist/SHA256SUMS.txt'),'utf8')).split(' ')[0];
  assert.equal(createHash('sha256').update(await readFile(join(root,'dist',`webmcp-script-${version}.zip`))).digest('hex'),checksum);
  execFileSync('unzip',['-q',join(root,'dist',`webmcp-script-${version}.zip`),'-d',temp]);
  const files=await readdir(folder,{recursive:true});
  assert(!files.some(f=>f.split('/').some(p=>['node_modules','.local','.git'].includes(p))));
  const manifest=JSON.parse(await readFile(join(folder,'build.json'),'utf8'));
  for(const [file,hash] of Object.entries(manifest.files)){
    const bytes=await readFile(join(folder,file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,file);
    if(/\.(?:m?js|json|txt)$/.test(file))assert(!bytes.includes(Buffer.from(root)),`Publisher path leaked: ${file}`);
  }
  assert.equal(JSON.parse(await readFile(join(folder,'extension/connection-config.json'),'utf8')),null);
  const config=JSON.parse(execFileSync(process.execPath,[join(folder,'setup.mjs')],{cwd:temp,encoding:'utf8'}));
  await assert.rejects(access(join(folder,'.local')));
  assert.equal(config.mcpServers['webmcp-script'].args[0],await realpath(join(folder,'bridge/server.mjs')));
  const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  demo=spawn(process.execPath,[join(folder,'demo.mjs')],{cwd:temp,env:{...process.env,DEMO_PORT:String(port),NODE_PATH:''},stdio:['ignore','pipe','inherit']});
  await once(demo.stdout,'data');
  assert((await (await fetch(`http://127.0.0.1:${port}/`)).text()).includes('id="message"'));
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/local-demo.user.js`)).text(),await readFile(join(folder,'examples/local-demo.user.js'),'utf8'));
  demo.kill();await once(demo,'exit');demo=null;
  execFileSync(process.execPath,[join(folder,'scripts/bundle-native.mjs'),join(temp,'native-bundle'),join(folder,'examples/local-demo.user.js')],{cwd:temp,stdio:'pipe'});
  await access(join(temp,'native-bundle/runtime.js'));
  client=new Client({name:'portable-acceptance',version:'1'});
  await client.connect(new StdioClientTransport({...config.mcpServers['webmcp-script'],cwd:temp,
    env:{...process.env,NODE_PATH:'',WEBMCP_PORT:String(port),WEBMCP_IDLE_MS:'500'},stderr:'pipe'}));
  const result=await client.callTool({name:'connection_info',arguments:{}});assert(!result.isError);
  const pairing=JSON.parse(JSON.parse(result.content[0].text).pairingCode);assert.equal(pairing.port,port);
  assert.equal((await client.callTool({name:'pages',arguments:{}})).isError,true);
  ws=new WebSocket(`ws://127.0.0.1:${port}/extension?token=${pairing.token}`,{origin:'chrome-extension://'+'a'.repeat(32)});await once(ws,'open');
  ws.on('message',raw=>{const req=JSON.parse(raw);if(req.method==='pages')ws.send(JSON.stringify({id:req.id,result:{pages:[{id:1,native:true,implementation:'native-0.4',tools:[{name:'example_read'}]}]}}));});
  const pages=await client.callTool({name:'pages',arguments:{}});assert(!pages.isError);assert.equal(JSON.parse(pages.content[0].text).pages[0].tools[0].name,'example_read');
  const status=await client.callTool({name:'script_library_status',arguments:{}});assert(!status.isError);
  const cli=JSON.parse(execFileSync(process.execPath,[join(folder,'scripts/library.mjs'),'status'],{cwd:temp,encoding:'utf8'}));assert.equal(cli.revision,0);
  console.log('Portable ZIP: clean relocation, hashes, no publisher paths, setup without writes, bundled MCP/relay, CLI and demo verified without node_modules. Mock extension transport only.');
}finally{demo?.kill();ws?.terminate();await client?.close();await new Promise(r=>setTimeout(r,800));await rm(temp,{recursive:true,force:true});}
