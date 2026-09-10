import {prepareImport,parseScript} from './metadata.js';
const $=id=>document.getElementById(id);
let scripts=[], preview, removing;
async function send(message) {const reply=await chrome.runtime.sendMessage(message);if(!reply) throw Error('扩展后台未响应，请重新加载扩展后重试');if(reply.error) throw Error(reply.error.message);return reply.result;}
function showError(message='') {$('error').textContent=message;$('error-box').hidden=!message;$('settings-error').textContent=message;}
function status(state) {
  $('connection').textContent=state.bridgeStatus;
  $('connection').dataset.connected=String(state.bridgeStatus==='已连接');
  $('connection-dot').dataset.connected=$('connection').dataset.connected;$('connection-dot').setAttribute('aria-label',state.bridgeStatus);
  $('setup-hint').hidden=state.bridgeStatus==='已连接';
  $('permission').textContent=state.userScriptsAvailable?'用户脚本已就绪':'请开启扩展的“允许用户脚本”';
  if(state.lastError) showError(state.lastError);
}
async function run(action) {showError();$('notice').textContent='';try {await action();await render();}catch(e){showError(e.message);} }
function previewScript(source, old, restoring=false) {
  const script=prepareImport(source,scripts,old?.id,old?.source,old?.enabled);
  preview={source,replace:old?.id,expectedSource:old?.source,expectedEnabled:old?.enabled,restoring};
  $('preview-title').textContent=restoring?'确认恢复上一版':old?'确认替换脚本':'确认安装脚本';
  $('preview-name').textContent=script.name;$('preview-id').textContent=script.id;
  $('preview-version').textContent=old?`${old.version} → ${script.version}`:script.version;
  $('preview-matches').textContent=script.matches.join('\n');
  $('preview-state').textContent=script.enabled?'确认后启用，并同步已打开的匹配页面':'保持停用；确认后不会运行脚本';
  const changed=old && JSON.stringify(old.matches)!==JSON.stringify(script.matches);
  $('preview-scope-change').textContent=changed?`网站范围已变化。当前范围：${old.matches.join('，')}`:'';
  $('preview-source').value=source;$('preview-error').textContent='';
  $('confirm-install').textContent=restoring?'确认恢复':old?'确认替换':'确认安装';
  $('preview-dialog').showModal();
}
async function render() {
  const state=await send({type:'status'});status(state);scripts=state.scripts;$('port').value=state.port??17891;
  $('script-count').textContent=scripts.length;renderScripts();
}
function renderScripts() {
  const query=$('search').value.trim().toLowerCase(),filter=$('filter').value;
  const visible=scripts.filter(s=>(filter==='all'||s.enabled===(filter==='enabled'))&&[s.name,s.id,...s.matches].some(v=>v.toLowerCase().includes(query)));
  $('scripts').replaceChildren();
  if(!visible.length) {
    const empty=document.createElement('div');empty.className='empty';
    const title=document.createElement('strong');title.textContent=scripts.length?'没有找到匹配的脚本':'添加第一个网站工具';
    const hint=document.createElement('p');hint.textContent=scripts.length?'换个关键词，或查看全部状态。':'导入 .user.js 文件，检查范围后即可使用。';
    const action=document.createElement('button');action.textContent=scripts.length?'清除筛选':'选择脚本文件';action.onclick=()=>{if(scripts.length){$('search').value='';$('filter').value='all';renderScripts();}else $('import').click();};
    empty.append(title,hint,action);$('scripts').append(empty);
  }
  for(const script of visible) {
    const card=document.createElement('article');card.className='script';card.dataset.scriptId=script.id;
    const heading=document.createElement('div');heading.className='section-heading';
    const name=document.createElement('h3');name.textContent=script.name;
    const stateLabel=document.createElement('span');stateLabel.className='script-state';stateLabel.dataset.enabled=script.enabled;stateLabel.textContent=script.enabled?'已启用':'已停用';heading.append(name,stateLabel);
    const meta=document.createElement('p');meta.className='script-meta';meta.textContent=`${script.id} · v${script.version}`;
    const scope=document.createElement('p');scope.className='scope';scope.textContent=script.matches.join('\n');
    const actions=document.createElement('div');actions.className='actions';
    const button=(text,fn,kind='')=>{const b=document.createElement('button');b.textContent=text;b.className=kind;b.onclick=()=>run(fn);actions.append(b);return b;};
    const toggle=button(script.enabled?'停用':'启用',()=>send({type:'toggle',id:script.id,enabled:!script.enabled}),'toggle');toggle.setAttribute('aria-pressed',String(script.enabled));toggle.title=script.enabled?'停用此脚本':'启用此脚本';
    const manage=document.createElement('details');manage.className='manage';
    const summary=document.createElement('summary');summary.textContent='管理';summary.setAttribute('aria-label',`管理 ${script.name}`);
    const options=document.createElement('div');options.className='manage-options';manage.append(summary,options);
    button('查看源码',()=>{$('source-title').textContent=script.name;$('source').value=script.source;$('source-dialog').showModal();});
    button('替换 / 更新',()=>{const input=document.createElement('input');input.type='file';input.accept='.js';input.onchange=()=>run(async()=>{if(input.files[0])previewScript(await input.files[0].text(),script);});input.click();});
    if(script.previousSource) {const restore=button('恢复上一版',()=>previewScript(script.previousSource,script,true));try{restore.title=`恢复至 ${parseScript(script.previousSource).version}`;}catch{restore.title='预览上一版源码';}}
    button('卸载',()=>{removing=script.id;$('remove-description').textContent=script.name;$('remove-error').textContent='';$('remove-dialog').showModal();},'danger');
    for(const action of [...actions.children].slice(1)) options.append(action);
    actions.append(manage);
    card.append(heading,meta,scope,actions);$('scripts').append(card);
  }
}
$('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file)return;const source=await file.text();$('import').value='';previewScript(source);});
$('cancel-install').onclick=()=>{$('preview-dialog').close();preview=undefined;};
$('preview-dialog').addEventListener('cancel',event=>{if($('confirm-install').disabled)event.preventDefault();else preview=undefined;});
$('confirm-install').onclick=async()=>{
  if(!preview)return;
  const current=preview;$('confirm-install').disabled=true;$('cancel-install').disabled=true;$('preview-error').textContent='';
  try {await send({type:'import',...current});$('preview-dialog').close();preview=undefined;showError();$('notice').textContent=current.restoring?'已恢复上一版，保留原有启停状态。':current.replace?'脚本已替换，保留原有启停状态。':'安装完成，已同步匹配页面。';await render();}
  catch(e){$('preview-error').textContent=e.message;showError(e.message);}
  finally{$('confirm-install').disabled=false;$('cancel-install').disabled=false;}
};
$('pair').onclick=()=>run(async()=>{await send({type:'pair',token:$('token').value,port:$('port').value});$('token').value='';});
$('retry').onclick=()=>run(()=>send({type:'retry'}));$('refresh').onclick=()=>run(()=>{});
run(()=>{});
setInterval(async()=>{try{status(await send({type:'status'}));}catch(e){showError(e.message);}},2000);

function view() {
  const id=location.hash==='#connection-settings'?'connection-settings':'library';
  for(const section of ['library','connection-settings']) $(section).hidden=section!==id;
  for(const link of document.querySelectorAll('nav a')) {if(link.hash==='#'+id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  document.title=`WebMCP Script · ${id==='library'?'脚本库':'连接设置'}`;
}
window.addEventListener('hashchange',view);view();
$('import-button').onclick=()=>$('import').click();
$('search').oninput=renderScripts;$('filter').onchange=renderScripts;
$('cancel-remove').onclick=()=>{$('remove-dialog').close();removing=undefined;};
$('remove-dialog').addEventListener('cancel',event=>{if($('confirm-remove').disabled)event.preventDefault();else removing=undefined;});
$('confirm-remove').onclick=async()=>{
  if(!removing)return;
  $('confirm-remove').disabled=true;$('cancel-remove').disabled=true;
  try{await send({type:'remove',id:removing});$('remove-dialog').close();removing=undefined;await render();$('notice').textContent='脚本已卸载。';}
  catch(e){$('remove-error').textContent=e.message;}
  finally{$('confirm-remove').disabled=false;$('cancel-remove').disabled=false;}
};
