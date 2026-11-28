/** Official local Cordis extension, loaded by the launch overlay. Private text
 * stays in memory and is keyed by the exact DSH Session, never by cwd. */
export const nativeTaskContextPlugin = String.raw`
export const name = 'acceptcat-task-context';
export function apply(ctx, config) {
  const contexts = new Map();
  const feedback = new Map();
  const call = async (operation, body) => {
    const response = await fetch(config.baseURL + '/acceptcat/' + operation, {
      method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+process.env.ACCEPTCAT_DSH_TOKEN},
      body:JSON.stringify(body), signal:AbortSignal.timeout(25000), redirect:'error',
    });
    if(!response.ok)throw Error('DeepChat 任务背景当前不可核验，请重新连接任务。');
    return response.json();
  };
  ctx.inject(['systemPrompt'], scope => scope.effect(() => scope.systemPrompt.context({
    name:'acceptcat:task-context', order:70,
    text:assembly=>contexts.get(assembly.scope?.session?.id)||'',
  })));
  ctx.on('agent/pre-step', async ({agent}, next) => {
    if(!/^acceptcat-[A-Za-z0-9_-]{1,128}$/.test(agent.session.id))return next();
    contexts.delete(agent.session.id);
    await feedback.get(agent.session.id);
    const value=await call('task-context',{sessionId:agent.session.id});
    if(value.content)contexts.set(agent.session.id,value.content);
    return next();
  });
  ctx.on('session/event',(session,event)=>{
    if(!/^acceptcat-[A-Za-z0-9_-]{1,128}$/.test(session.id))return;
    if(event.type!=='user/message'||!['user','user-rpc'].includes(event.data?.source?.kind))return;
    const text=(event.data.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
    if(text.length>2000||!/^(?:以后|请记住|记住|纠正|更正|我(?:更)?希望)/u.test(text.trim()))return;
    const pending=(feedback.get(session.id)||Promise.resolve()).then(()=>call('task-feedback',{sessionId:session.id,seq:event.seq,messageId:event.data.id,text}))
      .catch(()=>{ctx.logger.warn('DeepChat 习惯反馈暂不可用；本次要求仍在原会话。');});
    feedback.set(session.id,pending);
    void pending.finally(()=>{if(feedback.get(session.id)===pending)feedback.delete(session.id);});
  });
  ctx.effect(()=>()=>contexts.clear());
}
`;

export function buildNativeTaskContextClient(brand: string) {
  return String.raw`
window.__ModuleLoader__.load({id:'acceptcat-task-context',factory:(loadDshModule)=>{
const inject=['sessions','uiWorkspace'${brand ? ",'slots','locale','layout'" : ''}];
function apply(ctx){
  ${brand}
  const pending=new Set();
  const open=async(event)=>{
    const {sessionId,nonce}=event.detail||{};
    if(typeof sessionId!=='string'||!/^acceptcat-[A-Za-z0-9_-]{1,128}$/.test(sessionId)||pending.has(nonce))return;
    pending.add(nonce);
    let error='';
    try{
      for(let attempt=0;attempt<80;attempt++){
        await ctx.sessions.refresh();
        if(ctx.sessions.list.getSnapshot().byId[sessionId])break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      ctx.uiWorkspace.openSession(sessionId);
      await new Promise(resolve=>queueMicrotask(resolve));
      if(!(ctx.sessions.list.getSnapshot().byId[sessionId]?.retainedBy?.mainView>0))throw Error('未选中对应任务会话。');
    }catch(e){error=e.message||'任务会话无法打开。';}
    pending.delete(nonce);
    window.dispatchEvent(new CustomEvent('acceptcat-task-opened',{detail:{sessionId,nonce,error}}));
  };
  ctx.effect(()=>{window.addEventListener('acceptcat-open-task',open);return()=>window.removeEventListener('acceptcat-open-task',open);});
  window.dispatchEvent(new CustomEvent('acceptcat-task-client-ready'));
}
return {inject,apply};
}});
`;
}
