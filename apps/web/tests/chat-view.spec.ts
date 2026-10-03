import {describe,it,expect} from 'vitest';
import {renderMessage} from '../src/chat-view';
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
});
