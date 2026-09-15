import {$,send,element,discovery,matchesURL,toolSource,icon} from './ui.js';
for(const node of document.querySelectorAll('[data-icon]'))node.replaceWith(icon(node.dataset.icon));
async function open(hash) {try{await chrome.tabs.create({url:chrome.runtime.getURL('manager.html#'+hash)});window.close();}catch(e){error(e);}}
function error(e){$('error').textContent=e.message;$('error').hidden=false;}
$('manage').onclick=()=>open('scripts');$('new-script').onclick=()=>open('new');$('connect').onclick=()=>open('connection-settings');
async function render(){
  $('error').textContent='';$('error').hidden=true;
  const [state,tabs]=await Promise.all([send({type:'status'}),chrome.tabs.query({active:true,currentWindow:true})]);
  const connected=state.bridgeStatus==='已连接';
  $('connection').textContent=connected?'已连接':state.bridgeStatus==='连接中…'?'正在连接…':state.bridgeStatus==='未配对'?'未连接':'等待桥接';
  $('connection-mark').replaceChildren(icon(connected?'check':'link'));
  $('connect').dataset.connected=connected;
  $('connect').title=connected?'本机桥接已连接 · 点击打开连接设置':`${state.bridgeStatus} · 点击打开连接设置`;
  if(connected){$('popup-footer').append($('connect'));$('connect').setAttribute('aria-label','已连接，打开连接设置');}
  else{$('tools').before($('connect'));$('connect').setAttribute('aria-label',`${$('connection').textContent}，打开连接设置`);}
  const tab=tabs[0];
  const expanded=new Set([...$('scripts').querySelectorAll('details[open]')].map(node=>node.dataset.id));
  $('scripts').replaceChildren();
  const scripts=state.scripts.filter(s=>s.matches.some(pattern=>matchesURL(pattern,tab?.url)));
  $('script-count').textContent=String(scripts.length);
  if(!scripts.length)$('scripts').append(element('span','本页无匹配脚本','muted popup-empty'));
  for(const script of scripts){
    const row=element('div',undefined,'popup-script'),toggleLabel=element('label',undefined,'script-toggle'),toggle=element('input');
    toggle.type='checkbox';toggle.checked=script.enabled;toggle.setAttribute('aria-label',`启用 ${script.name}`);
    toggle.onchange=async()=>{toggle.disabled=true;$('error').hidden=true;try{await send({type:'toggle',id:script.id,enabled:toggle.checked});await render();}catch(e){toggle.checked=script.enabled;error(e);}finally{toggle.disabled=false;}};
    toggleLabel.append(toggle,element('span',script.enabled?'已启用':'已停用'));
    const details=element('details'),summary=element('summary'),name=element('span',script.name,'popup-script-name');
    name.title=script.name;summary.append(name,icon('chevron'));details.dataset.id=script.id;details.open=expanded.has(script.id);
    const actions=element('div',undefined,'script-actions'),edit=element('button'),remove=element('button');
    edit.append(icon('edit'),element('span','编辑'));remove.append(icon('trash'),element('span','删除'));
    edit.onclick=()=>open('edit/'+encodeURIComponent(script.id));
    remove.onclick=async()=>{
      if(!confirm(`删除“${script.name}”？当前版本和上一版将被删除。`))return;
      remove.disabled=true;$('error').hidden=true;
      try{await send({type:'remove',id:script.id});await render();}catch(e){error(e);}finally{remove.disabled=false;}
    };
    actions.append(toggleLabel,edit,remove);details.append(summary,actions);row.append(details);$('scripts').append(row);
  }
  if(state.lastError)error(Error(state.lastError));
  $('tool-list').replaceChildren();
  if(!/^https?:/.test(tab?.url||'')){$('tool-count').textContent='当前页面不支持';return;}
  const page=await send({type:'inspect',pageId:tab.id}), status=discovery(page);$('tool-count').textContent=status.ready?String(page.tools.length):status.text;
  if(page.errors?.length)error(Error(page.errors.join('；')));
  if(status.ready){
    const groups=new Map();
    for(const tool of page.tools){const key=tool.source?.kind==='script'?`script:${tool.source.id}`:tool.source?.kind||'unknown';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tool);}
    for(const tools of groups.values()){
      const group=element('li'),list=element('ul');
      if(tools[0].source){const source=element('span',toolSource(tools[0]),'tool-source');source.title=tools[0].source.label||toolSource(tools[0]);group.append(source);}
      for(const tool of tools){const row=element('li',tool.name);row.title=tool.name;list.append(row);}
      group.append(list);$('tool-list').append(group);
    }
  }
}
render().catch(e=>{$('tool-count').textContent='无法读取页面';error(e);});
