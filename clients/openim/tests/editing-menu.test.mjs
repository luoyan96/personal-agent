import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editingMenu, inputContextMenu } from '../electron/utils/editingMenu.ts';

const labels = { undo:'撤销',redo:'重做',cut:'剪切',copy:'复制',paste:'粘贴',delete:'删除',selectAll:'全选' };
const flags = {canUndo:true,canRedo:false,canCut:true,canCopy:true,canPaste:true,canDelete:true,canSelectAll:true,canEditRichly:false};
const context=(type='input-text',editable=true,editFlags=flags)=>({formControlType:type,isEditable:editable,editFlags});
const actions=items=>Object.fromEntries(items.filter(i=>i.role).map(i=>[i.role,i]));

test('one native editing policy supports normal inputs and rich editors; paste uses the real paste event',()=>{
  for(const type of ['input-text','input-search','input-url','input-email','input-number','text-area','none']){
    const a=actions(inputContextMenu(context(type),labels));
    assert.equal(a.paste.role,'paste');assert.equal(a.paste.enabled,true);
    assert.equal(a.copy.enabled,true);assert.equal(a.redo.enabled,false);
    assert.equal(a.paste.click,undefined); // no DOM insertion or clipboard IPC bypass
  }
  assert.equal(actions(editingMenu(labels)).selectAll.role,'selectAll');
});

test('read-only inputs allow copying without enabling mutation, even if supplied edit flags disagree',()=>{
  const a=actions(inputContextMenu(context('input-text',false),labels));
  assert.equal(a.copy.enabled,true);assert.equal(a.selectAll.enabled,true);
  for(const role of ['paste','cut','delete','undo','redo'])assert.equal(a[role].enabled,false);
});

test('passwords can be pasted but never copied or cut through the generic menu',()=>{
  const a=actions(inputContextMenu(context('input-password'),labels));
  assert.equal(a.paste.enabled,true);assert.equal(a.copy.enabled,false);assert.equal(a.cut.enabled,false);
});

test('empty clipboard/selection and undo availability follow current Chromium flags',()=>{
  const a=actions(inputContextMenu(context('input-search',true,{...flags,canCopy:false,canPaste:false,canUndo:false}),labels));
  assert.equal(a.copy.enabled,false);assert.equal(a.paste.enabled,false);assert.equal(a.undo.enabled,false);
});

test('ordinary text, messages, images and files keep their own context menus',()=>{
  for(const type of ['none','input-file','input-checkbox','button-button'])assert.deepEqual(inputContextMenu(context(type,false),labels),[]);
});
