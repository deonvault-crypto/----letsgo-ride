export function formatTripDate(date: string, time?: string) {
  if (!date) return "Date to be confirmed";
  return time ? `${date} at ${time}` : date;
}
