import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy – DropList',
  description: 'How DropList collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">← Back to DropList</Link>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: April 25, 2026</p>

        <p>
          DropList ("we", "our", or "us") is committed to protecting your privacy. This policy
          explains what information we collect, how we use it, and your rights.
        </p>

        <h2>1. Information We Collect</h2>
        <ul>
          <li>
            <strong>Google Account data</strong> — When you sign in with Google, we receive your
            name, email address, and profile picture via OAuth. We do not receive your Google
            password.
          </li>
          <li>
            <strong>Google Drive data</strong> — We access only the folder(s) you explicitly share
            with DropList (read-only). We do not store your Drive files; we only read file metadata
            and stream audio directly to your browser.
          </li>
          <li>
            <strong>Subscription & payment data</strong> — Payments are processed by Stripe. We
            store your plan status (Free / Pro) and subscription period in our database. We never
            see or store full credit card numbers.
          </li>
          <li>
            <strong>Usage data</strong> — We may log basic usage information (e.g. errors,
            performance metrics) to maintain and improve the service.
          </li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To authenticate you and maintain your account.</li>
          <li>To deliver the DropList music player experience.</li>
          <li>To manage your subscription and process payments through Stripe.</li>
          <li>To respond to support requests you send us.</li>
          <li>To improve the product based on usage patterns.</li>
        </ul>

        <h2>3. Data Sharing</h2>
        <p>We do not sell your data. We share it only with:</p>
        <ul>
          <li>
            <strong>Google</strong> — for OAuth authentication and Drive API access.
          </li>
          <li>
            <strong>Stripe</strong> — for payment processing and subscription management.
          </li>
          <li>
            <strong>Supabase</strong> — our database provider, which stores your account and
            playlist data.
          </li>
          <li>
            <strong>Vercel</strong> — our hosting provider.
          </li>
        </ul>

        <h2>4. Data Retention</h2>
        <p>
          We retain your account data for as long as your account is active. You may request
          deletion at any time by contacting us (see Section 7). We will delete your data within
          30 days of a verified request.
        </p>

        <h2>5. Cookies & Local Storage</h2>
        <p>
          We use session cookies required for authentication (NextAuth.js). We do not use
          third-party advertising cookies.
        </p>

        <h2>6. Security</h2>
        <p>
          We use HTTPS for all communications. Access tokens are stored securely and are scoped
          to the minimum permissions needed. No service is perfectly secure; we will notify you
          promptly if a breach affects your data.
        </p>

        <h2>7. Your Rights</h2>
        <p>
          You may request access to, correction of, or deletion of your personal data at any
          time. To exercise these rights, contact us at the address below.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. The "last updated" date at the top will
          reflect any changes. Continued use of DropList after changes constitutes acceptance of
          the updated policy.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions or requests regarding this policy can be sent to{' '}
          <a href="mailto:support@droplist.app">support@droplist.app</a>.
        </p>
      </div>
    </div>
  );
}
