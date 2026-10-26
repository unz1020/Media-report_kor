/** Workspace month navigation only. Never copies plans, facts or proofs. */
export function validWorkspaceMonth(value: unknown): value is string {
  return typeof value === 'string' && value.length === 7 && /^(?:19[7-9]\d|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);
}
export function seoulReportingMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit'}).format(now);
}
export function shiftWorkspaceMonth(month: string, offset = 1): string {
  if (!validWorkspaceMonth(month) || !Number.isInteger(offset)) throw new Error('INVALID_WORKSPACE_MONTH');
  const date = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5))-1+offset, 1));
  const value = date.toISOString().slice(0,7);
  if (!validWorkspaceMonth(value)) throw new Error('INVALID_WORKSPACE_MONTH');
  return value;
}
export function workspaceMonthOptions(known: readonly string[], selected: string, current = seoulReportingMonth()): string[] {
  if (!validWorkspaceMonth(current)) throw new Error('INVALID_WORKSPACE_MONTH');
  return [...new Set([current,shiftWorkspaceMonth(current),selected,...known].filter(validWorkspaceMonth))].sort().reverse();
}
