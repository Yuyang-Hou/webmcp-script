import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {config,version} from './config.mjs';
const {token,port,idleMs}=await config();
const clients=new Set(),pending=new Map();
const methods=new Set(['catalog','entry','pages','inspect','describe','call','visit']);
let peer,sequence=0,idle;
const send=(ws,message)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));};
const changed=()=>{for(const client of clients)send(client,{type:'changed'});};
const http=createServer((_req,res)=>{res.writeHead(404);res.end('WebMCP Script local relay');});
const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024});
function authorized(supplied) {const a=Buffer.from(supplied||''),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}
http.on('upgrade',(req,socket,head)=>{
  let url;try {url=new URL(req.url,'http://127.0.0.1');} catch {socket.destroy();return;}
  const extension=url.pathname==='/extension',client=url.pathname==='/client';
  const allowed=extension ? /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin||'')&&authorized(url.searchParams.get('token'))&&!peer :
    client&&!req.headers.origin&&req.headers['x-webmcp-protocol']==='1'&&authorized(req.headers.authorization?.replace(/^Bearer /,''));
  if(!allowed){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,extension));
});
function settle(id,result,error) {
  const task=pending.get(id);if(!task)return;
  pending.delete(id);clearTimeout(task.timer);
  send(task.client,{id:task.id,...(error?{error:{message:error}}:{result})});
}
function scheduleIdle() {
  clearTimeout(idle);
  if(clients.size===0)idle=setTimeout(()=>{peer?.terminate();wss.close();http.close();},idleMs);
}
wss.on('connection',(ws,extension)=>{
  ws.on('error',()=>{});
  let heartbeat;
  if(extension){peer=ws;heartbeat=setInterval(()=>send(ws,{type:'ping'}),20000);changed();}
  else{clients.add(ws);clearTimeout(idle);send(ws,{type:'hello',protocol:1,version});}
  ws.on('message',raw=>{
    let msg;try {msg=JSON.parse(raw);}catch{ws.close(1003);return;}
    if(!msg||typeof msg!=='object'||Array.isArray(msg)){ws.close(1003);return;}
    if(extension){
      if(msg.type==='changed'){changed();return;}
      if(Number.isSafeInteger(msg.id))settle(msg.id,msg.result,msg.error?String(msg.error.message||'EXTENSION_ERROR'):undefined);
      return;
    }
    if(!Number.isSafeInteger(msg.id)||msg.id<1||!methods.has(msg.method)||!msg.params||typeof msg.params!=='object'||Array.isArray(msg.params)){ws.close(1003);return;}
    if(!peer||peer.readyState!==WebSocket.OPEN){send(ws,{id:msg.id,error:{message:'EXTENSION_DISCONNECTED: open the manager and pair this browser.'}});return;}
    if(pending.size>=128){send(ws,{id:msg.id,error:{message:'BRIDGE_BUSY: too many outstanding requests.'}});return;}
    const id=++sequence;
    const timer=setTimeout(()=>settle(id,undefined,'TIMEOUT: operation outcome unknown; do not automatically retry.'),25000);
    pending.set(id,{client:ws,id:msg.id,timer});
    send(peer,{id,method:msg.method,params:msg.params});
  });
  ws.on('close',()=>{
    clearInterval(heartbeat);
    if(extension&&peer===ws){peer=undefined;for(const id of pending.keys())settle(id,undefined,'DISCONNECTED: operation outcome may be unknown; do not automatically retry.');changed();}
    if(!extension){clients.delete(ws);for(const [id,task] of pending)if(task.client===ws){clearTimeout(task.timer);pending.delete(id);}scheduleIdle();}
  });
});
http.on('error',error=>{
  // Multiple clients may start concurrently; the process winning the port serves all of them.
  if(error.code==='EADDRINUSE')process.exit(0);
  console.error(error.message);process.exit(1);
});
http.listen(port,'127.0.0.1',()=>{console.error(`WebMCP Script relay ${version} on 127.0.0.1:${port}`);scheduleIdle();});
function shutdown(){for(const client of clients)client.terminate();peer?.terminate();clearTimeout(idle);wss.close();http.close();}
process.on('SIGTERM',()=>{shutdown();process.exit(0);});
process.on('SIGINT',()=>{shutdown();process.exit(0);});
