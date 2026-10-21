import { Alert, Button } from 'antd';
import { useResearchRead } from './useResearchRead';
import { researchApi } from './api';

export function FeishuLibrarySource({id,onAsk}:{id:string;onAsk:()=>void}) {
  const read=useResearchRead(signal=>researchApi('feishuLibraries',{signal}),'external-library:'+id);
  const library=read.data?.data.find(s=>s.collectionId===id);
  if(read.error)return <Alert type="warning" message={read.error} action={<Button onClick={read.refresh}>重试</Button>}/>;
  if(!read.data)return <p role="status">正在读取资料库绑定…</p>;
  if(!library)return <Alert type="warning" message="这个绑定已不可用，请重新读取集合或在对话中重新发送链接。"/>;
  return <section className="research-library-empty" aria-label="飞书资料库绑定">
    <h3>已连接飞书数据表</h3>
    <p>{library.tableName} · 仅自己可见</p>
    <p>原始资料在飞书维护。直接向下方资料 Agent 说出库名和条件，每次查询读取最新可读记录。</p>
    <p>{library.mapping.date?'可按发表日期查询。':library.mapping.year?'当前只有年份，可按年度查询；精确的过去12个月需要发表日期字段。':'尚未识别到年份或发表日期字段。'}</p>
    <p>已识别字段：{library.fields.map(f=>f.name).join('、')}</p>
    <Button type="primary" onClick={onAsk}>向资料 Agent 查询此库</Button>
    <p><a href={library.sourceUrl} target="_blank" rel="noopener noreferrer">在飞书查看原表 ↗</a></p>
    <small>没有复制全部论文或读取 PDF 附件；不会自动分享你的飞书权限。</small>
  </section>;
}
