export function formatBytes(bytes: number, precision = 3) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(precision)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(precision)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3).toLocaleString()} KB`;
  return `${bytes.toLocaleString()} B`;
}

export function formatSeconds(seconds: number, precision = 0) {
  if (seconds < 1) return `${Math.round(seconds * 1_000)} ms`;
  const rounded = Number(seconds.toFixed(precision));
  const minutes = Math.floor(rounded / 60);
  const remainder = (rounded % 60).toFixed(precision);
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function formatModelTime(value: string) {
  return value.replace(/^0m\s+/, "").replace(/\b0(\d)s$/, "$1s");
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
