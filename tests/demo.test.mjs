import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
test('native demo serves exactly the independently distributed scripts',async()=>{
  const server=spawn(process.execPath,['scripts/demo.mjs'],{env:{...process.env,DEMO_PORT:'17933'},stdio:['ignore','pipe','pipe']});
  try {
    await once(server.stdout,'data');
    const get=async path=>(await fetch('http://127.0.0.1:17933'+path)).text();
    assert(!(await get('/')).includes('src="/local-demo.user.js"'));
    assert((await get('/native')).includes('src="/local-demo.user.js"'));
    assert((await get('/only?native=route')).includes('src="/route-demo.user.js"'));
    assert.equal(await get('/local-demo.user.js'),await readFile('dist/examples/local-demo.user.js','utf8'));
    assert.equal(await get('/route-demo.user.js'),await readFile('dist/examples/route-demo.user.js','utf8'));
  } finally {server.kill();await once(server,'exit');}
});
