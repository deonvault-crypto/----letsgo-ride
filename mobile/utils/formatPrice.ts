export function formatUsd(value: number) {
  return `US$${Number(value || 0).toFixed(0)}`;
}
