import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {manageLibrary} from '../scripts/library.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const root=await mkdtemp(join(tmpdir(),'webmcp-library-')),file=join(root,'example.user.js');
const library=join(root,'library'),run=(action,args)=>manageLibrary(action,args,library);
const source=`// ==UserScript==
// @id example
// @name Example
// @version 1.0.0
// @match http://localhost/*
// ==/UserScript==
document.modelContext.registerTool({name:'example',description:'Example',inputSchema:{type:'object'},execute:()=> 'ok'});
`;
let client;
try {
 await writeFile(file,source);let preview=await run('preview',{path:file});
 await writeFile(file,source+'\n// changed');await assert.rejects(run('import',{path:file,sha256:preview.script.sha256,expectedRevision:preview.revision}),/预览不一致/);
 await writeFile(file,source);let s=await run('import',{path:file,sha256:preview.script.sha256,expectedRevision:0});assert.equal(s.revision,1);
 await assert.rejects(run('disable',{id:'example',expectedRevision:0}),/STALE_REVISION/);
 const competing=await Promise.allSettled([run('disable',{id:'example',expectedRevision:1}),run('enable',{id:'example',expectedRevision:1})]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
 s=await run('status');s=await run('disable',{id:'example',expectedRevision:s.revision});
 await writeFile(file,source.replace('1.0.0','1.0.1'));preview=await run('preview',{path:file});s=await run('import',{path:file,sha256:preview.script.sha256,expectedRevision:preview.revision});assert.equal(s.scripts[0].enabled,false);assert.equal(s.scripts[0].canRestore,true);
 s=await run('restore',{id:'example',expectedRevision:s.revision});assert.equal(s.scripts[0].version,'1.0.0');
 s=await run('enable',{id:'example',expectedRevision:s.revision});s=await run('build',{expectedRevision:s.revision});
 const build=s.build;assert.equal(JSON.parse(await readFile(join(build.extensionPath,'manifest.json'),'utf8')).content_scripts.length,1);
 s=await run('select',{buildId:build.id,expectedRevision:s.revision});assert.equal(s.pendingChanges,false);assert(s.pageVerification.startsWith('unknown'));
 const manifestPath=join(build.extensionPath,'manifest.json'),savedManifest=await readFile(manifestPath,'utf8');
 await writeFile(manifestPath,savedManifest+' ');await assert.rejects(run('select',{buildId:build.id,expectedRevision:s.revision}),/构建内容已变化/);await writeFile(manifestPath,savedManifest);
 await writeFile(file,source+'\nconst = ;');await assert.rejects(run('preview',{path:file}),SyntaxError);assert.equal((await run('status')).revision,s.revision);await writeFile(file,source.replace('1.0.0','1.0.1'));
 const cli=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/library.mjs',import.meta.url)),'status'],{env:{...process.env,WEBMCP_LIBRARY_DIR:library}});
 assert.equal(JSON.parse(cli.stdout).revision,s.revision);
 client=new Client({name:'library-check',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bridge/server.mjs',import.meta.url))],env:{...process.env,WEBMCP_LIBRARY_DIR:library,WEBMCP_TOKEN:'library-test-token-00000000000000000000',WEBMCP_PORT:'17948'},stderr:'pipe'}));
 const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert(!result.isError,result.content[0].text);return JSON.parse(result.content[0].text);};
 assert.equal((await call('script_library_status')).revision,s.revision);
 const fromMcp=await call('script_preview',{path:file});s=await call('script_import',{path:file,sha256:fromMcp.script.sha256,expectedRevision:fromMcp.revision});assert.equal(s.scripts[0].version,'1.0.1');
 s=await call('script_change',{action:'remove',id:'example',expectedRevision:s.revision});assert.equal(s.scripts.length,0);assert.equal(await readFile(s.archivedSource,'utf8'),source.replace('1.0.0','1.0.1'));
 s=await call('native_build',{expectedRevision:s.revision});assert(!JSON.parse(await readFile(join(s.build.extensionPath,'manifest.json'),'utf8')).content_scripts);
 assert.equal((await run('status')).revision,s.revision);
 console.log('CLI/MCP share atomic library; stale preview and concurrent writes rejected; restore, archive and immutable builds verified');
} finally {await client?.close();await rm(root,{recursive:true,force:true});}
