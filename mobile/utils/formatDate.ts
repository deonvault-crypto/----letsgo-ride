export function formatTripDate(date: string, time?: string) {
  if (!date) return "Date to be confirmed";
  const parsedDate = parseDateOnly(date);
  const dateLabel = parsedDate
    ? parsedDate.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })
    : date;
  const timeLabel = formatTripTime(time);
  return timeLabel ? `${dateLabel} - ${timeLabel}` : dateLabel;
}

export function formatTripTime(time?: string) {
  if (!time) return "";
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidTripTime(time: string) {
  return Boolean(formatTripTime(time));
}

function parseDateOnly(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
