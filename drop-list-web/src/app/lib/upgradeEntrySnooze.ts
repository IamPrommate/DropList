/** localStorage key — date value is YYYY-MM-DD in the user's local calendar. */
export const UPGRADE_ENTRY_SNOOZE_STORAGE_KEY = 'droplist-upgrade-entry-snooze-date';

export function getLocalCalendarDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isUpgradeEntrySnoozedForToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(UPGRADE_ENTRY_SNOOZE_STORAGE_KEY) === getLocalCalendarDateKey();
  } catch {
    return false;
  }
}

export function snoozeUpgradeEntryModalForToday(): void {
  try {
    localStorage.setItem(UPGRADE_ENTRY_SNOOZE_STORAGE_KEY, getLocalCalendarDateKey());
  } catch {
    /* ignore quota / private mode */
  }
}
