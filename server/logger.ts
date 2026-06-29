export function isHiveDebugEnabled(): boolean {
  return process.env.HIVE_DEBUG !== "false";
}

export function logHive(event: string, details: Record<string, unknown> = {}): void {
  if (!isHiveDebugEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[hive] ${timestamp} ${event}`, compact(details));
}

export function logHiveWarn(event: string, details: Record<string, unknown> = {}): void {
  const timestamp = new Date().toISOString();
  console.warn(`[hive] ${timestamp} ${event}`, compact(details));
}

export function previewText(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function compact(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}
