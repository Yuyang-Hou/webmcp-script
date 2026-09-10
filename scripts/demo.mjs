import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>WebMCP Script 本地验收</title><style>body{font:18px system-ui;max-width:760px;margin:80px auto;background:#f6f8fc;color:#182439}a,button{margin:12px;padding:12px}article{background:white;padding:32px;border-radius:18px}</style><article><h1>WebMCP Script 本地验收</h1><p id="message">这是一张可控的本地演示页面，不连接业务系统。</p><p><a href="#/home">首页</a><a href="#/other">其他路由</a><a href="/second">完整导航</a></p><button id="spa">pushState 路由切换</button><p id="route"></p></article><script>function render(){document.querySelector('#route').textContent=location.pathname+location.hash}document.querySelector('#spa').onclick=()=>{history.pushState({},'',location.pathname==='/other'?'/':'/other');render()};addEventListener('hashchange',render);addEventListener('popstate',render);render()</script></html>`;
const scripts = new Map([['/local-demo.user.js', new URL('../dist/examples/local-demo.user.js', import.meta.url)], ['/route-demo.user.js', new URL('../dist/examples/route-demo.user.js', import.meta.url)]]);
const port = Number(process.env.DEMO_PORT || 17892);
createServer(async (req,res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const file = scripts.get(url.pathname);
  try {
    if (file) { const source = await readFile(file); res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'}); res.end(source); return; }
    const script = url.pathname === '/native' ? '/local-demo.user.js' : url.searchParams.get('native') === 'route' ? '/route-demo.user.js' : '';
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'"});
    res.end(html.replace('</html>', (script ? `<script src="${script}"></script>` : '') + '</html>'));
  } catch { res.writeHead(500); res.end('Demo asset unavailable; run pnpm build.'); }
}).listen(port,'127.0.0.1',()=>console.log(`Demo: http://127.0.0.1:${port} — native: /native`));
