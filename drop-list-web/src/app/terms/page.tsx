import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service – DropList',
  description: 'Terms and conditions for using DropList.',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">← Back to DropList</Link>

        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: April 25, 2026</p>

        <p>
          By accessing or using DropList ("Service"), you agree to be bound by these Terms of
          Service ("Terms"). If you do not agree, do not use the Service.
        </p>

        <h2>1. Description of Service</h2>
        <p>
          DropList is a web-based music player that lets you stream audio files stored in your
          Google Drive. The Service requires a Google account and, for Pro features, a paid
          subscription.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be at least 13 years old to use DropList. By using the Service you represent
          that you meet this requirement.
        </p>

        <h2>3. Your Account</h2>
        <p>
          You are responsible for maintaining the security of your Google account and for all
          activity that occurs under your DropList account. Notify us immediately of any
          unauthorized use.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service to stream or distribute content you do not have the right to use.</li>
          <li>Attempt to reverse-engineer, scrape, or disrupt the Service.</li>
          <li>Share your account credentials with others.</li>
          <li>Use the Service for any unlawful purpose.</li>
        </ul>

        <h2>5. Content & Copyright</h2>
        <p>
          DropList streams files directly from your Google Drive. You are solely responsible for
          ensuring you have the right to store and play the audio files in your Drive. We do not
          host, cache, or distribute your audio files.
        </p>

        <h2>6. Subscriptions & Payments</h2>
        <ul>
          <li>
            <strong>Free plan</strong> — limited features, available to all users at no cost.
          </li>
          <li>
            <strong>Pro plan</strong> — paid monthly subscription, processed by Stripe.
          </li>
          <li>
            Subscriptions auto-renew until cancelled. You may cancel at any time from your
            account settings; access continues until the end of the current billing period.
          </li>
          <li>
            Refunds are handled on a case-by-case basis. Contact support within 7 days of a
            charge if you believe it was made in error.
          </li>
        </ul>

        <h2>7. Termination</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate these Terms, with or
          without notice. You may delete your account at any time by contacting us.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided "as is" without warranties of any kind. We do not guarantee
          uninterrupted or error-free operation, and we are not liable for issues caused by Google
          Drive or Stripe services outside our control.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, DropList shall not be liable for any indirect,
          incidental, or consequential damages arising from your use of the Service. Our total
          liability to you shall not exceed the amount you paid us in the 3 months preceding the
          claim.
        </p>

        <h2>10. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. The "last updated" date at the top will
          reflect changes. Continued use after changes constitutes acceptance of the new Terms.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:support@droplist.app">support@droplist.app</a>.
        </p>
      </div>
    </div>
  );
}
