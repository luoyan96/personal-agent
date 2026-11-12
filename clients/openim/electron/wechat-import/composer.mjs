/** Build a draft after explicit preview confirmation. The host owns staging and sending. */
export async function prepareWeChatDraft({ client, scope, preview, attachmentIds = [], includeOriginal = false, isCurrentScope }) {
  if (!isCurrentScope(scope)) throw new Error('会话已变化，请重新导入。');
  const selected = [...new Set(attachmentIds)];
  if (selected.some(id => !preview.attachments.some(item => item.id === id))) {
    throw new Error('请选择预览中的附件。');
  }
  const files = [];
  for (const id of selected) {
    const item = preview.attachments.find(attachment => attachment.id === id);
    const bytes = await client.read(scope, preview.token, id);
    files.push(new File([bytes], item.name.split('/').pop(), { type: 'application/octet-stream' }));
  }
  if (includeOriginal) {
    const bytes = await client.read(scope, preview.token, 'original');
    files.push(new File([bytes], preview.archiveName, { type: 'application/zip' }));
  }
  if (!isCurrentScope(scope)) throw new Error('会话已变化，请重新导入。');
  return { source: 'wechat-share', sourceHash: preview.sha256, text: preview.rawText ?? '', files };
}
