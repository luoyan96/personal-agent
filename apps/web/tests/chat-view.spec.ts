import {describe,it,expect} from 'vitest';
import {renderMessage,renderHistory} from '../src/chat-view';
import {pendingChatSource} from '../src/chat-source';

describe('chat presentation boundary',()=>{
  it('escapes server content and opaque action identifiers in cards',()=>{
    const output=renderMessage({id:'" onclick="evil',sender:'<script>bad</script>',identity:'AI',time:'<time>',own:false,text:'<img onerror=evil>',card:{kind:'result',title:'<b>artifact</b>',detail:'<script>private</script>',status:'<status>',actions:[{id:'" onclick="evil',label:'<confirm>'}]}});
    expect(output).not.toContain('<script>');expect(output).not.toContain('<img');
    expect(output).toContain('&lt;confirm&gt;');expect(output).toContain('&quot; onclick=&quot;evil');
  });
  it('does not invent conversations, agents or writable operations without chat API',async()=>{
    const source=pendingChatSource([]);
    const snapshot=await source.read(new AbortController().signal);
    expect(snapshot.contacts).toEqual([]);expect(snapshot.conversations).toEqual([]);
    expect(source.send).toBeUndefined();expect(source.act).toBeUndefined();expect(source.openContact).toBeUndefined();
  });
  it('does not return data after cancellation',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(pendingChatSource([]).read(controller.signal)).rejects.toThrow();
  });
  it('keeps complete confirmation payload and its controls in the same expandable review',()=>{
    const html=renderMessage({id:'msg',sender:'助理',identity:'AI',time:'现在',own:false,text:'请核对',card:{kind:'invitation',title:'建群建议',detail:'成员：合成甲\n分享：所选材料\n预算：12000 tokens',status:'待确认',actions:[{id:'confirm',label:'确认上述完整范围'}]}});
    const details=html.slice(html.indexOf('<details'),html.indexOf('</details>'));
    expect(details).toContain('成员：合成甲');expect(details).toContain('分享：所选材料');expect(details).toContain('预算：12000 tokens');expect(details).toContain('data-card-action="confirm"');expect(details).not.toContain(' open');
  });
  it('groups chronological messages by a five-minute gap using actual server timestamps',()=>{
    const message={id:'one',sender:'甲',identity:'真人',time:'现在',own:false,text:'正文'};
    const html=renderHistory([{...message,createdAt:'2026-10-04T00:00:00Z'},{...message,id:'two',createdAt:'2026-10-04T00:04:00Z'},{...message,id:'three',createdAt:'2026-10-04T00:10:00Z'}]);
    expect(html.match(/class="chat-time-divider"/g)).toHaveLength(2);
  });
});
