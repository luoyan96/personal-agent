import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

/** Convert the user's wall-clock choice in its explicit zone, not the computer's zone. */
export function personalDueInstant(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("请选择提醒日期和时间。");
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone });
    const date = dayjs.tz(value, timeZone);
    if (!date.isValid() || date.format("YYYY-MM-DDTHH:mm") !== value)
      throw new Error("invalid date");
    const wall = Date.parse(`${value}:00Z`);
    const possible = new Set<number>();
    for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
      const offset = date.add(hours, "hour").tz(timeZone).utcOffset();
      const instant = wall - offset * 60_000;
      if (dayjs(instant).tz(timeZone).format("YYYY-MM-DDTHH:mm") === value)
        possible.add(instant);
    }
    if (possible.size > 1)
      throw new Error("该时间在所选时区出现两次，请选择没有歧义的时间。");
    return date.toISOString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("出现两次")) throw error;
    throw new Error("请核对日期、时间和时区；该时间可能不存在。");
  }
}

export function personalDueLabel(instant: string, timeZone: string) {
  try {
    return `${new Intl.DateTimeFormat("zh-CN", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(instant))} · ${timeZone}`;
  } catch {
    return "时间暂无法显示，请刷新核对。";
  }
}

export function personalDueInput(instant: string, timeZone: string) {
  return dayjs(instant).tz(timeZone).format("YYYY-MM-DDTHH:mm");
}
