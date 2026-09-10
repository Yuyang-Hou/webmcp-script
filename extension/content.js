(() => {
  if (globalThis.__webmcpScriptContent) return;
  globalThis.__webmcpScriptContent = true;
  const pending = new Map();
  addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'webmcp-script-page') return;
    const data = event.data;
    if (data.type === 'changed') chrome.runtime.sendMessage({type:'changed',errors:data.snapshot?.errors}).catch(()=>{});
    const entry = pending.get(data.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(data.id); entry.reply(data); }
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type !== 'page') return;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reply({error:{message:'页面工具未就绪或调用超时（未自动重试）'}}); }, 20000);
    pending.set(id, {reply,timer});
    window.postMessage({source:'webmcp-script-content',id,method:message.method,params:message.params}, '*');
    return true;
  });
})();
