/** Adapted from openimsdk/openim-electron-demo/src/utils/common.ts at
 * 62d7ca7b12e91144b315f36c8ebd1d9e0457a352. See third-party/openim. */
export const bytesToSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024,
    sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size % 1 === 0 ? size : size.toFixed(2)} ${sizes[i]}`;
};

export const getFileType = (name: string) => {
  const idx = name.lastIndexOf('.');
  return name.slice(idx + 1);
};

/** OpenIM's recent/calendar/older-date branches, translated to the built-in
 * Intl formatter so the existing frontend does not need dayjs or i18next. */
export function formatConversationTime(value?: string, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const elapsed = now.getTime() - date.getTime();
  if (elapsed >= 0 && elapsed < 60000) return '刚刚';
  if (elapsed >= 0 && elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit', hour12:false});
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', date.getFullYear() === now.getFullYear() ? {month:'numeric',day:'numeric'} : {year:'numeric',month:'numeric',day:'numeric'});
}

export function formatMessageTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const time = date.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',hour12:false});
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  const day = date.toLocaleDateString('zh-CN', date.getFullYear() === now.getFullYear() ? {month:'numeric',day:'numeric'} : {year:'numeric',month:'numeric',day:'numeric'});
  return `${day} ${time}`;
}
