const DAY = 86_400_000;
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

export function stamp(ms: number) {
  const days = (startOfDay(Date.now()) - startOfDay(ms)) / DAY;
  if (days === 0) return clock(ms);
  if (days === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const full = (ms: number) =>
  new Date(ms).toLocaleString([], { dateStyle: "full", timeStyle: "short" });

export function day(ms: number) {
  const days = (startOfDay(Date.now()) - startOfDay(ms)) / DAY;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = new Date(ms);
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
