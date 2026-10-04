import {describe,it,expect} from 'vitest';
import {renderContactProfile,contactErrorText} from '../src/contact-panel';
import {ApiError} from '../src/api';

describe('unified contact profile presentation',()=>{
  it('explains version conflicts using the server code and keeps exact transport retry instructions',()=>{
    expect(contactErrorText(new ApiError('VERSION_CONFLICT','Request could not be completed.'))).toContain('填写内容已保留');
    expect(contactErrorText(new ApiError('NETWORK_ERROR','重试同一请求'))).toBe('重试同一请求');
  });
  const contact={id:'agent_<unsafe>',name:'<script>name</script>',identity:'个人 AI',owner:'主人',availability:'服务配置可用',icon:'robot' as const,role:'专属 Agent',profileVersion:4,introduction:'',capabilityDescription:'',personality:'',relationship:'等待同意',canOpenDirect:false,canManagePrivateMemory:false};
  it('escapes public profile text and does not invent empty specialties or expose private controls',()=>{
    const html=renderContactProfile(contact);
    expect(html).toContain('&lt;script&gt;name&lt;/script&gt;');expect(html).toContain('agent_&lt;unsafe&gt;');expect(html).not.toContain('<script>');
    expect(html.match(/尚未填写/g)).toHaveLength(3);expect(html).not.toContain('data-profile-chat');expect(html).not.toContain('data-profile-memory');expect(html).not.toContain('data-profile-edit');
  });
  it('shows only service granted actions and identifies the actual stable agent',()=>{
    const html=renderContactProfile({...contact,canOpenDirect:true,canEdit:true,canManagePrivateMemory:true,canRemove:true});
    expect(html).toContain('data-profile-chat');expect(html).toContain('data-profile-edit');expect(html).toContain('data-profile-memory');expect(html).toContain('data-profile-remove');expect(html).toContain('档案 v4');expect(html).toContain('专属 Agent');
    expect(html).not.toContain('data-profile-request');
  });
});
