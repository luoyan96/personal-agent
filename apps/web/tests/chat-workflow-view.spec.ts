import {describe,it,expect} from 'vitest';
import {applyDemandTemplate,demandTemplates,renderWorkflow,renderConversationHistory} from '../src/chat-view';
import type {ConversationView} from '../src/chat-view';
import type {ConversationWorkflowView,WorkflowTaskView} from '../src/chat-workflow-types';

const task:WorkflowTaskView={id:'task_qa',title:'合成任务',status:'待验收',stage:'review',goal:'检查材料',acceptanceCriteria:'保留引用',assignees:['合成研究员'],nextStep:'由验收人核对指定版本。',actionLabel:'查看交付与验收',href:'#/tasks/task_qa',runStatus:'运行成功',latestDelivery:{revision:2,status:'待人工验收',summary:'合成候选已提交'}};
const workflow:ConversationWorkflowView={joinedMembers:3,invitedMembers:1,totalTasks:2,completedTasks:1,restrictedTasks:0,tasks:[task,{...task,id:'task_done',title:'已验收任务',status:'已完成',stage:'done'}]};
describe('research chat workflow presentation',()=>{
  it('only inserts an editable request in an empty draft and preserves every existing character',()=>{
    expect(demandTemplates).toHaveLength(3);
    expect(applyDemandTemplate('','literature')).toContain('验收要求');
    expect(applyDemandTemplate('已有科研草稿','analysis')).toBeUndefined();
    expect(applyDemandTemplate(' ','writing')).toBeUndefined();
    expect(applyDemandTemplate('','unknown')).toBeUndefined();
  });
  it('uses authoritative task counts and separate review/run/delivery states',()=>{
    const html=renderWorkflow(workflow,{open:true,taskIds:new Set([task.id])});
    expect(html).toContain('已完成 1 / 可查看 2 项');expect(html).toContain('运行成功');expect(html).toContain('交付 v2');expect(html).toContain('待人工验收');expect(html).toContain('已接受承接者');expect(html).toContain('保留引用');expect(html).toContain('href="#/tasks/task_qa"');expect(html).toContain('data-workflow-task="task_qa" open');
  });
  it('escapes all projected details and only permits internal task actions',()=>{
    const html=renderWorkflow({...workflow,tasks:[{...task,id:'"<unsafe>',title:'<script>x</script>',goal:'<img onerror=x>',nextStep:'<svg>',href:'javascript:alert(1)'}]},{open:false,taskIds:new Set()});
    expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('javascript:');expect(html).toContain('&lt;svg&gt;');expect(html).toContain('aria-expanded="false"');
  });
  it('is compatible without a workflow and adds no guessed restricted details',()=>{
    expect(renderWorkflow(undefined,{open:false,taskIds:new Set()})).toBe('');
    const html=renderWorkflow({...workflow,tasks:[{...task,stage:'restricted',goal:'',acceptanceCriteria:'',assignees:[],latestDelivery:undefined,runStatus:undefined,actionLabel:'',href:''}]},{open:true,taskIds:new Set()});
    expect(html).toContain('授权摘要');expect(html).toContain('按当前授权查看');expect(html).not.toContain('交付 v');expect(html).not.toContain('<a ');
  });
  it('shows demand guidance only in the actual fixed coordinator and retains real history',()=>{
    const base:ConversationView={id:'personal_qa',title:'需求与协作',subtitle:'合成协调 Agent · 需求协调 Agent',preview:'',pinned:true,group:false,messages:[],members:[],canSend:true,fixed:true};
    expect(renderConversationHistory(base)).toContain('data-demand-template="literature"');
    expect(renderConversationHistory({...base,fixed:false})).not.toContain('data-demand-template');
    expect(renderConversationHistory({...base,messages:[{id:'message_qa',sender:'合成研究员',identity:'真人',own:true,text:'已保存的真实消息',time:'现在'}]})).toContain('已保存的真实消息');
  });
});
