export const metadata = {
  title: "Privacy Policy — Happy Tusk",
  description: "Privacy policy for the Happy Tusk budgeting app.",
};

export default function PrivacyPage() {
  const lastUpdated = "February 18, 2026";

  return (
    <div className="min-h-screen bg-white px-6 py-12 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

      <section className="mb-8">
        <p className="text-gray-700 leading-relaxed">
          Happy Tusk (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a
          zero-based budgeting app. This policy explains what information we
          collect, how we use it, and your rights regarding your data.
        </p>
      </section>

      <Section title="Information We Collect">
        <p>We collect the following categories of information:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            <strong>Account information</strong> — your email address and name,
            provided when you create an account via Clerk.
          </li>
          <li>
            <strong>Budget data</strong> — budgets, categories, budget items,
            and planned amounts you create in the app.
          </li>
          <li>
            <strong>Transaction data</strong> — transactions you manually add or
            import from linked bank accounts.
          </li>
          <li>
            <strong>Recurring payment data</strong> — subscriptions and bills
            you track in the app.
          </li>
          <li>
            <strong>Bank connection data</strong> — if you link a bank account,
            we store an access token (provided by Teller) that allows us to
            retrieve your transaction history. We never store your bank
            credentials.
          </li>
        </ul>
      </Section>

      <Section title="How We Use Your Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>To provide and operate the Happy Tusk app and its features.</li>
          <li>
            To sync transactions from your linked bank accounts on your request.
          </li>
          <li>
            To associate your budget data with your account so it persists
            across devices.
          </li>
          <li>We do not sell your personal information to third parties.</li>
          <li>
            We do not use your financial data for advertising or marketing
            purposes.
          </li>
        </ul>
      </Section>

      <Section title="Third-Party Services">
        <p>Happy Tusk relies on the following third-party services:</p>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li>
            <strong>Clerk</strong> (clerk.com) — handles user authentication and
            account management. Clerk stores your email and name. See{" "}
            <a
              href="https://clerk.com/privacy"
              className="text-green-700 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Clerk&apos;s Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Teller</strong> (teller.io) — provides secure bank account
            connectivity. Your bank credentials are entered directly into
            Teller&apos;s interface and are never shared with us. See{" "}
            <a
              href="https://teller.io/privacy"
              className="text-green-700 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Teller&apos;s Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Supabase</strong> (supabase.com) — our database provider,
            used to store your budget and transaction data securely. Data is
            stored in the United States.
          </li>
        </ul>
      </Section>

      <Section title="Data Retention">
        <p>
          Your data is retained for as long as your account is active. You may
          delete your account at any time by contacting us, which will result in
          permanent deletion of all associated budget data.
        </p>
      </Section>

      <Section title="Data Security">
        <p>
          All data is transmitted over HTTPS. We use Clerk&apos;s
          industry-standard authentication to ensure only you can access your
          account. Bank credentials are never stored — only a secure access
          token is retained for transaction syncing.
        </p>
      </Section>

      <Section title="Your Rights">
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Access the data we hold about you.</li>
          <li>Request deletion of your account and all associated data.</li>
          <li>Disconnect your bank accounts at any time within the app.</li>
        </ul>
      </Section>

      <Section title="Children's Privacy">
        <p>
          Happy Tusk is not directed at children under the age of 13. We do not
          knowingly collect personal information from children under 13.
        </p>
      </Section>

      <Section title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify
          users of significant changes by updating the date at the top of this
          page.
        </p>
      </Section>

      <Section title="Contact Us">
        <p>
          If you have questions about this Privacy Policy or your data, contact
          us at:{" "}
          <a
            href="mailto:support@happytusk.app"
            className="text-green-700 underline"
          >
            support@happytusk.app
          </a>
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
