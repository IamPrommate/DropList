/**
 * Internal admin notification when a new Google user row is created.
 * Uses Resend HTTP API; never throws — signup must succeed even if mail fails.
 */

export type AdminSignupPayload = {
  userId: string;
  email: string;
  name: string | null | undefined;
  signupIp: string | null;
  at: string;
};

export async function notifyAdminNewSignup(payload: AdminSignupPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ADMIN_SIGNUP_NOTIFY_EMAIL?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !to || !from) {
    return;
  }

  const text = [
    'New DropList signup (Google)',
    '',
    `User ID: ${payload.userId}`,
    `Email: ${payload.email}`,
    `Name: ${payload.name ?? '(none)'}`,
    `Signup IP: ${payload.signupIp ?? '(unknown)'}`,
    `Time: ${payload.at}`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[DropList] New signup: ${payload.email}`,
        text,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(
        '[DropList] adminSignupNotify Resend HTTP',
        res.status,
        errBody.slice(0, 500),
      );
    }
  } catch (err) {
    console.warn('[DropList] adminSignupNotify failed:', err);
  }
}
