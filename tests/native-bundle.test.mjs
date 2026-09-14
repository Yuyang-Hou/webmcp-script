import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {bundleNative} from '../scripts/bundle-native.mjs';
const root=await mkdtemp(join(tmpdir(),'webmcp-bundle-'));
try {
 const source=`// ==UserScript==
// @id native-test
// @name Native test
// @version 1.0.0
// @match http://localhost/*
// ==/UserScript==
document.modelContext.registerTool({name:'plain_native',description:'Test',inputSchema:{type:'object'},execute:()=> 'ok'});
`;
 const input=join(root,'native.user.js'),out=join(root,'extension');await writeFile(input,source);
 const manifest=await bundleNative([input],out);
 assert.equal(manifest.content_scripts[0].world,'MAIN');assert.deepEqual(manifest.content_scripts[0].matches,['http://localhost/*']);
 assert(!manifest.permissions && !manifest.background && !manifest.options_page && !manifest.options_ui);
 const registered=[];
 const context=vm.createContext({document:{modelContext:{registerTool:tool=>registered.push(tool)}},WebMCPScript:{beginScript(){return ()=>{};}},console,Date});
 await vm.runInContext(await readFile(join(out,'scripts/native-test.js'),'utf8'),context);
 assert.equal(registered[0].name,'plain_native');assert.equal(registered[0].execute(),'ok');
 await assert.rejects(bundleNative([input],out),{code:'EEXIST'});
 assert.equal(JSON.parse(await readFile(join(out,'manifest.json'),'utf8')).version,'0.4.0');
 await assert.rejects(bundleNative([input,input],join(root,'duplicate')),/ID 重复/);
 await writeFile(input,source+'\nconst = ;');await assert.rejects(bundleNative([input],join(root,'broken')),SyntaxError);
 console.log('native bundle accepts standard scripts, scopes injection and preserves existing output');
} finally {await rm(root,{recursive:true,force:true});}
