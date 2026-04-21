/** Inbox for DropList customer support (mailto links). */
export const SUPPORT_EMAIL = 'droplist.app@gmail.com';

export function buildSupportMailto(user: { id?: string | null; email?: string | null }): string {
  const lines = [
    '---',
    `User ID: ${user.id ?? 'unknown'}`,
    `Email: ${user.email ?? 'unknown'}`,
    '---',
    '',
    'Describe your issue here...',
  ];
  const body = lines.join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('DropList Support')}&body=${encodeURIComponent(body)}`;
}
