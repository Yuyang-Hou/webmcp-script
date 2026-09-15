import assert from 'node:assert/strict';
import {discovery,matchesURL,toolSource} from '../extension/ui.js';
import {parsePairing,connectionInstructions,connectionChecks,connectionNext} from '../extension/connection.js';
const token='a'.repeat(64);
assert.equal(toolSource({source:{kind:'script',id:'plain',name:'阅读助手'}}),'脚本 · 阅读助手');
assert.equal(toolSource({source:{kind:'page'}}),'页面提供');
assert.equal(toolSource({name:'plain__guess'}),'来源未确认');
assert.deepEqual(parsePairing(JSON.stringify({version:1,token,port:17999}),17891),{token,port:17999});
assert.deepEqual(parsePairing(token,'17891'),{token,port:17891});
for(const value of ['', 'too-short', '{broken', JSON.stringify({version:2,token,port:17891}), JSON.stringify({version:1,token,port:99999}),JSON.stringify({version:1,token:token+'\n',port:17891})])assert.throws(()=>parsePairing(value));
assert.match(connectionInstructions({mcpServers:{}}),/connection_info/);
assert(!connectionInstructions({mcpServers:{}}).includes('pairing-token'));
assert.match(connectionInstructions(null),/node setup.mjs/);
assert(!connectionInstructions(null).includes('undefined'));
assert.match(connectionChecks({bridgeStatus:'未配对',userScriptsAvailable:false},[]).join(' '),/允许用户脚本.*尚未配对.*HTTP\(S\)/);
const checks=connectionChecks({bridgeStatus:'已连接',userScriptsAvailable:true},[{native:true,implementation:'native-0.4',tools:[{name:'read'}]},{native:false}]).join(' ');
assert.match(checks,/仍需让 AI 调用 pages/);assert.match(checks,/1 \/ 2.*1 个工具/);
assert.equal(discovery({implementation:'native-0.4',native:true,tools:[]}).text,'0 个工具');
for(const page of [undefined,{error:'denied'},{native:false,implementation:'native-0.4'}, {native:true,tools:[]}])assert.equal(discovery(page).ready,false);
for(const [pattern,url,expected] of [
 ['https://*.example.com/*','https://example.com/a',true],['https://*.example.com/*','https://sub.example.com/a',true],
 ['https://*.example.com/*','https://badexample.com/a',false],['https://example.com/*','http://example.com/a',false],
 ['*://example.com/path*','https://example.com/path?q=1#x',true],['*://*/*','chrome://extensions/',false],
 ['http://localhost/*','http://localhost:17892/a',true],['https://example.com/a','https://example.com/a?b=1',false],
 ['https://example.com/*',undefined,false]
])assert.equal(matchesURL(pattern,url),expected,`${pattern} ${url}`);

assert.match(connectionNext('等待本机桥接，自动重连中'),/暂不需要重新粘贴/);
assert.match(connectionNext('本地端口无效，请重新配对'),/端口无效/);
