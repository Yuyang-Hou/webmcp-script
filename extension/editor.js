import {EditorView, basicSetup} from 'codemirror';
import {javascript} from '@codemirror/lang-javascript';
import {keymap, placeholder} from '@codemirror/view';
import {undo, redo} from '@codemirror/commands';
import {openSearchPanel} from '@codemirror/search';
export function createEditor(parent, doc, changed, save) {
  const view = new EditorView({parent, doc, extensions:[
    basicSetup, javascript(), placeholder('在此粘贴完整的 .user.js 脚本'),
    EditorView.contentAttributes.of({'aria-label':'脚本源码'}),
    keymap.of([{key:'Mod-s', run:() => {save(); return true;}}]),
    EditorView.updateListener.of(update => {if (update.docChanged) changed(update.state.doc.toString());}),
    EditorView.theme({
      '&':{height:'100%',fontSize:'var(--font-body)',fontFamily:'var(--font-ui)'}, '.cm-scroller':{overflow:'auto',fontFamily:'var(--font-code)',lineHeight:'1.65'},
      '.cm-gutters':{backgroundColor:'#fafafa',color:'#737985',borderRight:'1px solid #efeff1'},
      '.cm-activeLineGutter':{backgroundColor:'#f0f1f3'},
      '&.cm-focused':{outline:'none'}, '.cm-content':{padding:'12px 0'}, '.cm-line':{padding:'0 16px'}
    })
  ]});
  return {
    focus:() => view.focus(), destroy:() => view.destroy(),
    replace:source => view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source}}),
    find:() => openSearchPanel(view), undo:() => undo(view), redo:() => redo(view)
  };
}
