export type GroupMentionContact = {
  id: string;
  displayName: string;
  agent: boolean;
  external: boolean;
};

/** Only an explicit leading address dispatches work; quoted @ text never does. */
export function groupMentions(text: string, joined: GroupMentionContact[]) {
  let offset = text.length - text.trimStart().length;
  if (text[offset] !== "@") return undefined;
  const mentions: { contactId: string; start: number; end: number }[] = [];
  let agentContactId: string | undefined;
  while (text[offset] === "@") {
    const matches = joined.filter((c) => {
      const label = "@" + c.displayName;
      return text.startsWith(label, offset) &&
        (offset + label.length === text.length || /\s/u.test(text[offset + label.length]));
    }).sort((a, b) => b.displayName.length - a.displayName.length);
    const contact = matches[0];
    if (!contact) throw new Error("请选择已加入的群成员，并在 @姓名 后加一个空格。");
    if (matches.filter((c) => c.displayName === contact.displayName).length !== 1)
      throw new Error("群内有同名成员，请在协作选项中选择具体 Agent。");
    if (mentions.some((m) => m.contactId === contact.id))
      throw new Error("同一条消息无需重复 @同一个成员。");
    if (mentions.length >= 20) throw new Error("每条消息最多 @20 个成员。");
    if (contact.agent) {
      if (contact.external) throw new Error("此 Agent 连接外部服务，请打开私聊并授权发送本条文字。");
      if (agentContactId) throw new Error("一次先给一个 Agent 分配任务；可以同时 @参与的真人。");
      agentContactId = contact.id;
    }
    const end = offset + contact.displayName.length + 1;
    mentions.push({ contactId: contact.id, start: offset, end });
    offset = end;
    while (/\s/u.test(text[offset] || "") && offset < text.length) offset++;
  }
  if (!text.slice(offset).trim()) throw new Error("请在 @成员 后写上消息或任务内容。");
  return { mentions, agentContactId };
}
