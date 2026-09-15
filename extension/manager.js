import {digest,updateSettings} from './updates.js';
import {prepareImport,createScriptTemplate} from './metadata.js';
import {parsePairing,connectionInstructions,connectionChecks,connectionNext} from './connection.js';
import {$,send,element,discovery,connection,matchesURL,toolSource} from './ui.js';
let scripts=[], pages=[], draft, editor, pending, busy=false;
let noticeTimer;
let connectionConfig;
function message(id,text='') {
  const node=$(id);node.textContent=text;node.hidden=!text;
  if(id==='notice') {
    clearTimeout(noticeTimer);
    if(text)noticeTimer=setTimeout(()=>{node.hidden=true;node.textContent='';},3000);
  }
}
const dirty=()=>!!draft && draft.source !== (draft.base?.source ?? draft.initialSource ?? '');
function remember() {try {if(draft)sessionStorage.setItem('script-draft',JSON.stringify(draft));else sessionStorage.removeItem('script-draft');}catch {message('error','浏览器无法暂存草稿，请保存后再关闭页面。');}}
function editorState() {
  $('save').disabled=busy||!draft||!draft.source.trim()||!!draft.base&&!dirty();$('dirty').hidden=!dirty();
  $('editor-tab').hidden=!draft||!!draft.newTab;
  $('filename').textContent=draft?.base?`${draft.base.id}.user.js`:'新建脚本';
  $('save-state').textContent=busy?'正在保存…':dirty()?'未保存的修改':draft?.base?'已保存':'新建脚本';
  $('restore').disabled=!draft?.base?.previousSource;$('reopen').disabled=!draft?.base;
}
async function run(action) {message('error');try {await action();}catch(e){message('error',e.message);}}
function updateStatus(state) {
  $('connection').dataset.connected=state.bridgeStatus==='已连接';
  $('connection-label').textContent=state.bridgeStatus==='已连接'?'已连接':state.bridgeStatus==='连接中…'?'连接中…':state.bridgeStatus==='未配对'?'未连接':'等待桥接';
  $('connection').title=`${connection(state)} · 点击打开连接设置`;
  $('connection').setAttribute('aria-label',`${connection(state)}，打开连接设置`);
  const connected=state.bridgeStatus==='已连接',waiting=state.bridgeStatus==='连接中…',unpaired=state.bridgeStatus==='未配对';
  $('connection-state').textContent=connected?'浏览器已连接':waiting?'正在连接…':unpaired?'尚未连接':state.bridgeStatus;
  $('connection-state').dataset.connected=connected;
  $('connection-next').textContent=connectionNext(state.bridgeStatus);
  $('permission').textContent=state.userScriptsAvailable?'允许用户脚本 · 已就绪':'尚未允许用户脚本';
  if(state.lastError)message('error',state.lastError);
}
$('connection').onclick=()=>{location.hash='connection-settings';};
async function refresh() {
  const state=await send({type:'status'});scripts=state.scripts;updateStatus(state);renderScripts();
  const result=await send({type:'pages'});pages=result.pages;renderScripts();renderPages();
}
function renderScripts() {
  const query=$('search').value.trim().toLowerCase(), filter=$('filter').value;
  const visible=scripts.filter(s=>(filter==='all'||s.enabled===(filter==='enabled'))&&[s.name,s.id,...s.matches].some(v=>v.toLowerCase().includes(query)));
  $('script-count').textContent=`${scripts.length} 个脚本`;$('script-rows').replaceChildren();
  $('empty').hidden=!!visible.length;$('empty-text').textContent=scripts.length?'没有找到匹配的脚本':'还没有安装脚本';
  $('empty-action').textContent=scripts.length?'清除筛选':'＋ 新建脚本';
  for(const script of visible) {
    const row=element('tr');row.dataset.scriptId=script.id;
    const toggle=element('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.checked=script.enabled;toggle.setAttribute('aria-label',`启用 ${script.name}`);
    toggle.onchange=()=>run(async()=>{toggle.disabled=true;try{await send({type:'toggle',id:script.id,enabled:toggle.checked});await refresh();}catch(e){toggle.checked=script.enabled;throw e;}finally{toggle.disabled=false;}});
    const enabled=element('td');enabled.append(toggle);
    const name=element('td'), edit=element('button',script.name,'script-name');edit.onclick=()=>run(()=>openDraft(script));
    name.append(edit,element('div',script.id,'script-id'));
    if(script.updates?.message)name.append(element('div',script.updates.message,'muted'));
    const version=element('td',script.version,'version-cell'), site=element('td',script.matches.join('\n'),'site-cell scope');
    const found=pages.filter(p=>discovery(p).ready&&p.tools.some(t=>t.source?.kind==='script'&&t.source.id===script.id)).length;
    const matched=pages.filter(p=>script.matches.some(pattern=>matchesURL(pattern,p.url)));
    const state=element('td',!script.enabled?'已停用':found?`${found} 个页面发现工具`:matched.length?'等待页面验证':'没有匹配页面','state-cell muted');
    state.title='仅表示当前页面的工具发现结果，不代表已加载最新源码';
    const actions=element('td'), updates=element('button','更新','link-button'), remove=element('button','卸载','link-button');
    remove.onclick=()=>run(async()=>{if(!confirm(`卸载“${script.name}”？当前版本和上一版将被删除。`))return;await send({type:'remove',id:script.id});await refresh();message('notice','脚本已卸载。');});updates.onclick=()=>run(()=>openUpdates(script.id));actions.append(updates,remove);
    row.append(enabled,name,version,site,state,actions);$('script-rows').append(row);
  }
}
function renderPages() {
  $('page-list').replaceChildren();
  if(!pages.length)$('page-list').append(element('div','没有可读取的 HTTP(S) 网页。打开网站后点击刷新。','empty'));
  for(const page of pages) {
    const item=element('article',undefined,'page-item'), heading=element('div',undefined,'page-heading'), status=discovery(page);
    heading.append(element('strong',page.title||page.url),element('span',status.text,'muted'));
    item.append(heading,element('p',page.url,'muted'));
    if(status.ready&&page.tools.length) {
      const details=element('details'), list=element('ul');details.append(element('summary','查看工具'));
      for(const tool of page.tools){const li=element('li');li.append(element('code',tool.name));if(tool.source){const source=element('span',toolSource(tool),'tool-source');source.title=tool.source.label||toolSource(tool);li.append(source);}li.append(element('p',tool.description||'','muted'));list.append(li);}
      details.append(list);item.append(details);
    }
    for(const error of page.errors||[])item.append(element('p',error,'error'));
    $('page-list').append(item);
  }
}
async function openDraft(base,source=base?.source??createScriptTemplate()) {
  if(busy)return;
  if(draft?.base?.id===base?.id && base && source===base.source){location.hash='editor';editor?.focus();return;}
  if(dirty()&&!confirm('放弃当前未保存的修改？'))return;
  draft={base,source,newTab:!base,initialSource:source};remember();await mountEditor();location.hash='editor';view();editor.focus();
}
async function mountEditor() {
  const {createEditor}=await import('./editor.js');editor?.destroy();
  editor=createEditor($('code'),draft.source,source=>{draft.source=source;remember();editorState();},()=>run(save));
  editorState();
}
function view() {
  let id=location.hash.slice(1)||'scripts';
  if(!['scripts','pages','connection-settings','settings','editor'].includes(id))id='scripts';
  if(id==='editor'&&!draft)id='scripts';
  for(const section of ['scripts','pages','connection-settings','settings','editor'])$(section).hidden=section!==id;
  for(const link of document.querySelectorAll('.tab-rail a')){if(link.hash==='#'+id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  if(id==='editor'&&draft?.newTab)$('new-script').setAttribute('aria-current','page');else $('new-script').removeAttribute('aria-current');
  document.title=`WebMCP Script · ${id==='editor'?$('filename').textContent:document.querySelector('.tab-rail a[aria-current]')?.textContent||'脚本'}`;
}
async function save() {
  if(busy||!draft||!draft.source.trim()||draft.base&&!dirty())return;
  const base=draft.base, script=prepareImport(draft.source,scripts,base?.id,base?.source,base?.enabled);
  pending={source:draft.source,replace:base?.id,expectedSource:base?.source,expectedEnabled:base?.enabled};
  $('preview-title').textContent=base?'确认更新脚本':'确认安装脚本';$('preview-name').textContent=script.name;
  $('preview-version').textContent=base?`${base.version} → ${script.version}`:script.version;
  $('preview-entries').textContent=script.entries.length?script.entries.map(entry=>`${entry.title}: ${entry.url}\n参数: ${JSON.stringify(entry.parameters)}`).join('\n'):'未声明；AI 无法直接解析页面地址';
  $('preview-matches').textContent=script.matches.join('\n');$('preview-state').textContent=script.enabled?'保存后启用':'保留停用状态';
  $('scope-change').textContent=base&&JSON.stringify(base.matches)!==JSON.stringify(script.matches)?`原网站范围：${base.matches.join('，')}`:'';
  message('preview-error');$('preview-dialog').showModal();
}
$('confirm-save').onclick=async()=>{
  if(!pending||busy)return;
  busy=true;editorState();$('confirm-save').disabled=true;$('cancel-save').disabled=true;
  try {
    const saved=prepareImport(pending.source,scripts,pending.replace,pending.expectedSource,pending.expectedEnabled);
    await send({type:'import',...pending});
    draft={...draft,base:saved,source:saved.source};editor.replace(saved.source);remember();$('preview-dialog').close();pending=undefined;message('error');
    message('notice');
    await refresh();
  }catch(e){message($('preview-dialog').open?'preview-error':'error',e.message);}
  finally{busy=false;editorState();$('confirm-save').disabled=false;$('cancel-save').disabled=false;}
};
$('cancel-save').onclick=()=>{$('preview-dialog').close();pending=undefined;};
$('preview-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else pending=undefined;});
$('save').onclick=()=>run(save);
function selectNew() {
  if(draft?.newTab){location.hash='editor';view();editor?.focus();return;}
  return openDraft();
}
$('new-script').onclick=()=>run(selectNew);
$('file-new').onclick=()=>run(()=>openDraft());
$('empty-action').onclick=()=>{if(scripts.length){$('search').value='';$('filter').value='all';renderScripts();}else run(selectNew);};
$('file-close').onclick=$('close-editor').onclick=()=>{if(busy||dirty()&&!confirm('放弃未保存的修改并关闭脚本？'))return;editor?.destroy();editor=undefined;draft=undefined;remember();$('editor-tab').hidden=true;location.hash='scripts';view();};
$('reopen').onclick=()=>run(async()=>{
  const current=(await send({type:'status'})).scripts.find(s=>s.id===draft.base?.id);
  if(!current)throw Error('脚本已被卸载，当前草稿仍保留。');
  if(dirty()&&!confirm('放弃未保存的修改，重新读取已保存版本？'))return;
  draft={...draft,base:current,source:current.source};remember();await mountEditor();
});
$('restore').onclick=()=>run(async()=>{if(dirty()&&!confirm('放弃当前修改，预览上一版？'))return;editor.replace(draft.base.previousSource);await save();});
for(const action of ['undo','redo','find'])$(action).onclick=()=>editor?.[action]();
document.addEventListener('click',e=>{for(const menu of document.querySelectorAll('.menu[open]'))if(!menu.contains(e.target)||e.target.closest('button'))menu.open=false;});
$('search').oninput=renderScripts;$('filter').onchange=renderScripts;
$('refresh-pages').onclick=()=>run(refresh);
$('retry').onclick=()=>run(async()=>{await send({type:'retry'});await refresh();message('notice','已重新尝试加载脚本，请查看网页工具状态。');});
$('pair').onclick=async()=>{
  message('pair-error');$('pair').disabled=true;
  try {
    const {token,port}=parsePairing($('token').value,$('port').value);
    await send({type:'pair',token,port});$('token').value='';$('port').value=port;await refresh();
  }catch(e){message('pair-error',e.message);}finally{$('pair').disabled=false;}
};
async function copyConnection(text) {
  try {await navigator.clipboard.writeText(text);$('connection-copy-fallback').hidden=true;$('copy-feedback').textContent='已复制，粘贴到 AI 对话中继续。';}
  catch {$('connection-copy-fallback').value=text;$('connection-copy-fallback').hidden=false;$('connection-copy-fallback').focus();$('connection-copy-fallback').select();$('copy-feedback').textContent='浏览器未允许自动复制，请复制下方已选中的内容。';}
}
$('copy-connection').onclick=()=>copyConnection(connectionInstructions(connectionConfig,chrome.runtime.getManifest().version_name));
$('copy-config').onclick=()=>copyConnection(JSON.stringify(connectionConfig,null,2));
$('check-connection').onclick=()=>run(async()=>{
  $('check-connection').disabled=true;
  try{
    await refresh();
    const state=await send({type:'status'});
    $('connection-checks').replaceChildren(...connectionChecks(state,pages).map(text=>element('li',text)));
  }finally{$('check-connection').disabled=false;}
});
async function route() {
  if(location.hash==='#new'){await selectNew();return;}
  if(location.hash.startsWith('#edit/')){
    const id=decodeURIComponent(location.hash.slice(6));
    const script=(await send({type:'status'})).scripts.find(item=>item.id===id);
    if(!script){history.replaceState(null,'','#scripts');view();throw Error('脚本不存在或已删除');}
    await openDraft(script);
    if(location.hash.startsWith('#edit/'))location.hash=draft?'editor':'scripts';
    return;
  }
  view();
}
window.addEventListener('hashchange',()=>run(route));
window.addEventListener('beforeunload',e=>{if(dirty()||busy){e.preventDefault();e.returnValue='';}});
window.addEventListener('focus',()=>run(refresh));
async function init() {
  $('version').textContent=chrome.runtime.getManifest().version_name||chrome.runtime.getManifest().version;
  fetch(chrome.runtime.getURL('connection-config.json')).then(response=>{if(!response.ok)throw Error();return response.json();}).then(config=>{
    connectionConfig=config;$('mcp-config').value=config?JSON.stringify(config,null,2):'';$('copy-connection').disabled=false;$('copy-config').disabled=!config;
    $('portable-setup').hidden=!!config;
  }).catch(()=>{$('copy-feedback').textContent='安装信息无法读取。请重新解压完整发布包；从源码安装时请重新构建。';});
  const state=await send({type:'status'});$('port').value=state.port??17891;scripts=state.scripts;updateStatus(state);
  try {const stored=JSON.parse(sessionStorage.getItem('script-draft'));if(stored&&typeof stored.source==='string'){draft={...stored,newTab:stored.newTab??!stored.base};await mountEditor();}}catch{message('error','暂存草稿无法读取。');}
  await route();view();await refresh();
}
run(init);

setInterval(async()=>{try{const state=await send({type:'status'});updateStatus(state);if(JSON.stringify(scripts)!==JSON.stringify(state.scripts)){scripts=state.scripts;renderScripts();}}catch(e){message('error',e.message);}},3000);

let updateScript,updatePreview,updateBusy=false;
function updateButtons() {
  if(!updateScript)return;
  const settings=updateSettings(updateScript),available=!!(settings.updateURL&&settings.downloadURL);
  $('update-auto-check').disabled=updateBusy||!available;
  $('update-auto-install').disabled=updateBusy||!available||!$('update-auto-check').checked;
  $('update-check').disabled=updateBusy||!available;$('update-review').disabled=updateBusy||settings.status!=='available';
}
$('update-dialog').addEventListener('cancel',event=>{if(updateBusy)event.preventDefault();});
async function openUpdates(id) {
  const state=await send({type:'status'});updateScript=state.scripts.find(s=>s.id===id);
  if(!updateScript)throw Error('脚本已卸载');
  const settings=updateSettings(updateScript);
  $('update-title').textContent=`更新 · ${updateScript.name}`;
  $('update-auto-check').checked=settings.mode!=='manual';$('update-auto-install').checked=settings.mode==='auto';
  $('update-source').textContent=settings.updateURL?`更新地址由脚本声明：${settings.updateURL}`:'脚本未声明更新地址，请作者补充 @updateURL / @downloadURL';
  $('update-summary').textContent=`当前 ${updateScript.version} · 最新 ${settings.latestVersion||'尚未检查'} · 上次检查 ${settings.lastCheck?new Date(settings.lastCheck).toLocaleString():'尚未检查'}`;
  $('update-message').textContent=[settings.message||'勾选后自动保存；未勾选时仅手动检查',...(settings.reasons||[])].join('；');
  updateButtons();message('update-error');
  if(!$('update-dialog').open)$('update-dialog').showModal();
}
async function updateAction(action) {
  updateBusy=true;
  const buttons=['update-check','update-review','update-close','update-auto-check','update-auto-install'];for(const id of buttons)$(id).disabled=true;
  message('update-error');
  try {await action();}catch(error){message('update-error',error.message);}finally{updateBusy=false;for(const id of buttons)$(id).disabled=false;updateButtons();}
}
$('update-close').onclick=()=>$('update-dialog').close();
async function saveUpdateMode() {
  if(!$('update-auto-check').checked)$('update-auto-install').checked=false;
  const mode=$('update-auto-install').checked?'auto':$('update-auto-check').checked?'notify':'manual';
  await updateAction(async()=>{
    try {await send({type:'update-settings',id:updateScript.id,expectedSha256:await digest(updateScript.source),expectedRevision:updateSettings(updateScript).revision??null,mode});}
    finally {await openUpdates(updateScript.id);}
    await refresh();
  });
}
$('update-auto-check').onchange=saveUpdateMode;$('update-auto-install').onchange=saveUpdateMode;
$('update-check').onclick=()=>updateAction(async()=>{await send({type:'update-check',id:updateScript.id});await openUpdates(updateScript.id);await refresh();});
$('update-review').onclick=()=>updateAction(async()=>{
  await openUpdates(updateScript.id);
  updatePreview=await send({type:'update-preview',id:updateScript.id});
  $('update-diff').textContent=`版本：${updatePreview.before.version} → ${updatePreview.after.version}\n原网站：${updatePreview.before.matches.join(', ')}\n新网站：${updatePreview.after.matches.join(', ')}\n${updatePreview.reviewReasons.join('；')}`;
  $('update-old-source').value=updateScript.source;$('update-new-source').value=updatePreview.candidateSource;
  message('update-commit-error');$('update-commit').disabled=false;$('update-preview-dialog').showModal();
});
$('update-cancel').onclick=()=>{$('update-preview-dialog').close();updatePreview=undefined;};
$('update-commit').onclick=async()=>{
  if(!updatePreview)return;$('update-commit').disabled=true;$('update-cancel').disabled=true;
  try {await send({type:'update-commit',token:updatePreview.token});$('update-preview-dialog').close();updatePreview=undefined;await openUpdates(updateScript.id);await refresh();}
  catch(error){message('update-commit-error',error.message);updatePreview=undefined;}
  finally{$('update-commit').disabled=!updatePreview;$('update-cancel').disabled=false;}
};

$('update-preview-dialog').addEventListener('cancel',event=>{if($('update-cancel').disabled)event.preventDefault();else updatePreview=undefined;});
