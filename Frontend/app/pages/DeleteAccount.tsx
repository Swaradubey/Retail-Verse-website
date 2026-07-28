import React, { useEffect } from 'react';
import { ShieldAlert, Mail, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

export function DeleteAccount() {
  useEffect(() => {
    document.title = 'Delete Account | Retail Verse';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Learn how to permanently delete your Retail Verse account and understand data retention policies.'
    );
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="w-full max-w-[900px] mx-auto">
        {/* Navigation back button */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        {/* Clean white card container */}
        <main className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-10 lg:p-12">
          {/* Header section with Title & Red Warning Shield Icon */}
          <header className="border-b border-slate-100 pb-8 mb-8">
            <div className="flex items-center gap-3 sm:gap-4 mb-4">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-red-100/80 text-red-600 border border-red-200/60 shadow-sm">
                <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-red-600 block mb-1">
                  Account Management
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
                  Delete Your Retail Verse Account
                </h1>
              </div>
            </div>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              At Retail Verse, we respect your privacy and give you full control over your personal data. If you no longer wish to use our services, you can permanently delete your account.
            </p>
          </header>

          {/* Main content sections */}
          <div className="space-y-10">
            {/* Section 1: How to delete your account */}
            <section aria-labelledby="how-to-delete-heading" className="space-y-4">
              <h2 id="how-to-delete-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
                How to delete your account
              </h2>
              <p className="text-slate-600 leading-relaxed">
                You can easily delete your account directly from the Retail Verse app by following these steps:
              </p>

              <ol className="list-none space-y-3 pl-0">
                {[
                  'Open the Retail Verse app and log in.',
                  'Go to the My Account section.',
                  'Tap on the Delete Account option.',
                  'Confirm your choice to permanently delete your account.',
                ].map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3.5 text-slate-700 leading-relaxed">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 text-sm font-bold border border-slate-200 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <hr className="border-slate-100" />

            {/* Section 2: What happens when you delete your account? */}
            <section aria-labelledby="what-happens-heading" className="space-y-4">
              <h2 id="what-happens-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
                What happens when you delete your account?
              </h2>

              <ul className="space-y-3 pl-0">
                {[
                  'Your Retail Verse account will be permanently deleted.',
                  'Your personal information, including your name, email address, and profile details, will be removed.',
                  'Your business information, inventory data, orders, invoices, and other account-related records will be permanently deleted, except where retention is required by applicable law.',
                  'Any active subscriptions associated with your account will be cancelled. Deleting your account does not automatically refund previous payments.',
                  'You will lose access to all Retail Verse services and features.',
                  'This action is permanent and cannot be undone.',
                ].map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-slate-700 leading-relaxed">
                    <span className="h-2 w-2 rounded-full bg-red-500 mt-2.5 shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>

            <hr className="border-slate-100" />

            {/* Section 3: Before you delete your account */}
            <section aria-labelledby="before-you-delete-heading" className="space-y-4">
              <h2 id="before-you-delete-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
                Before you delete your account
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Please ensure that you:
              </p>

              <ul className="space-y-3 pl-0">
                {[
                  'Download or export any data you want to keep.',
                  'Complete any pending business activities or transactions.',
                  'Cancel any active subscriptions if applicable.',
                  'Understand that once your account is deleted, it cannot be restored.',
                ].map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-slate-700 leading-relaxed">
                    <span className="h-2 w-2 rounded-full bg-amber-500 mt-2.5 shrink-0" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </section>

            <hr className="border-slate-100" />

            {/* Section 4: Data Retention */}
            <section aria-labelledby="data-retention-heading" className="space-y-4">
              <h2 id="data-retention-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
                Data Retention
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Some information may be retained for a limited period if required to comply with legal, tax, accounting, fraud prevention, or regulatory obligations. Such data will only be retained for the period required by law.
              </p>
            </section>

            <hr className="border-slate-100" />

            {/* Section 5: Need Assistance? */}
            <section aria-labelledby="need-assistance-heading" className="space-y-4">
              <h2 id="need-assistance-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
                Need Assistance?
              </h2>
              <p className="text-slate-600 leading-relaxed">
                If you experience any issues while deleting your account or have questions about your data, our support team is here to help.
              </p>

              <address className="not-italic bg-slate-50 border border-slate-200/80 rounded-xl p-4 sm:p-5 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Email Support</span>
                  <a
                    href="mailto:support@retailverse.in"
                    className="text-base font-semibold text-blue-600 hover:text-blue-700 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  >
                    support@retailverse.in
                  </a>
                </div>
              </address>

              <p className="text-slate-600 leading-relaxed">
                We aim to respond to all support requests as quickly as possible.
              </p>
            </section>

            {/* Highlighted Final Warning Box */}
            <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-5 sm:p-6 text-red-950 flex items-start gap-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-red-900 text-sm sm:text-base uppercase tracking-wider">
                  Important Warning
                </h3>
                <p className="text-sm sm:text-base leading-relaxed text-red-900 font-medium">
                  By deleting your account within the Retail Verse app, you acknowledge that you understand this action is permanent and that your account and associated data cannot be recovered once the deletion process is completed.
                </p>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
