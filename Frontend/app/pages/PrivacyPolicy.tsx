import { Link } from 'react-router';
import { ArrowLeft, Lock, Eye, Database, Share2, Bell, Smartphone, Shield, Trash2, CreditCard } from 'lucide-react';

export function PrivacyPolicy() {
  const lastUpdated = "May 1, 2026";

  const sections = [
    {
      title: "1. Information We Collect",
      content: "We collect information you provide directly to us, such as when you create an account, make a purchase, or communicate with us. This may include your name, email address, phone number, shipping address, and payment information.",
      icon: <Database className="w-5 h-5 text-blue-400" />
    },
    {
      title: "2. How We Use Your Information",
      content: "We use the information we collect to provide, maintain, and improve our services, process your transactions, send you technical notices and updates, and respond to your comments and questions.",
      icon: <Eye className="w-5 h-5 text-purple-400" />
    },
    {
      title: "3. Data Info",
      content: "We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction. However, no security system is impenetrable.",
      icon: <Lock className="w-5 h-5 text-cyan-400" />
    },
    {
      title: "4. Sharing of Information",
      content: "We do not share your personal information with third parties except as described in this Privacy Policy, such as with your consent or to comply with legal obligations.",
      icon: <Share2 className="w-5 h-5 text-emerald-400" />
    },
    {
      title: "5. Your Choices",
      content: "You may update or correct your account information at any time by logging into your account. You may also opt-out of receiving promotional communications from us by following the instructions in those communications.",
      icon: <Bell className="w-5 h-5 text-amber-400" />
    }
  ];

  const posIntro = "The Retail Verse Point of Sale (POS) application is owned, operated, and managed by Retail Verse.";

  const posSubsections = [
    {
      title: "A. Information We Collect in the App",
      icon: <Smartphone className="w-5 h-5 text-blue-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-white/60 leading-relaxed">
            The Retail Verse POS application may request access to the following device permissions solely to provide core application functionality:
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-white font-semibold mb-1">• Camera</p>
              <p className="text-white/60 leading-relaxed">
                Used exclusively for barcode and QR code scanning during inventory management and billing. Images or videos are not stored or uploaded unless explicitly required by the user.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">• Bluetooth</p>
              <p className="text-white/60 leading-relaxed">
                Used only to connect compatible thermal printers and other supported POS hardware for printing receipts and related operations.
              </p>
            </div>
          </div>
          <p className="text-white/60 leading-relaxed">
            These permissions are processed locally on the user's device whenever possible and are never used for advertising or tracking purposes.
          </p>
          <p className="text-white/60 leading-relaxed">
            We may also collect the following account information to provide our services:
          </p>
          <ul className="list-disc list-inside text-white/60 leading-relaxed space-y-1">
            <li>Store name</li>
            <li>Business owner name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Business profile information</li>
          </ul>
          <p className="text-white/60 leading-relaxed">
            This information is used solely for account management, authentication, billing, customer support, and platform functionality.
          </p>
        </div>
      )
    },
    {
      title: "B. Data Security",
      icon: <Shield className="w-5 h-5 text-cyan-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-white/60 leading-relaxed">
            Retail Verse takes appropriate technical and organizational measures to protect business information.
          </p>
          <p className="text-white/60 leading-relaxed">
            Business data generated through the Retail Verse POS application, including inventory, products, invoices, billing records, customers, and sales information, is securely synchronized and protected using industry-standard security practices.
          </p>
          <p className="text-white/60 leading-relaxed">
            Retail Verse does not sell, rent, or trade your business data to third parties.
          </p>
        </div>
      )
    },
    {
      title: "C. Account and Data Deletion",
      icon: <Trash2 className="w-5 h-5 text-emerald-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-white/60 leading-relaxed">
            Users may permanently delete their Retail Verse account and associated business data by:
          </p>
          <ul className="list-disc list-inside text-white/60 leading-relaxed space-y-1">
            <li>Opening the Retail Verse POS application.</li>
            <li>Navigating to: Settings → Delete Account.</li>
          </ul>
          <p className="text-white/60 leading-relaxed">
            Alternatively, users may contact the Retail Verse support team to request permanent deletion of their account and associated data.
          </p>
          <p className="text-white/60 leading-relaxed">
            Once deletion is completed, data will be removed in accordance with our data retention policies and applicable legal requirements.
          </p>
        </div>
      )
    },
    {
      title: "D. Subscription & Payments",
      icon: <CreditCard className="w-5 h-5 text-amber-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-white/60 leading-relaxed">
            Retail Verse Plus subscriptions are managed through the Retail Verse platform.
          </p>
          <p className="text-white/60 leading-relaxed">
            To upgrade to the Plus plan, users should:
          </p>
          <ul className="list-disc list-inside text-white/60 leading-relaxed space-y-1">
            <li>
              Visit: <a href="https://retailverse.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">https://retailverse.com</a> from a desktop or laptop computer,
            </li>
            <li>or Contact the Retail Verse support team for assistance.</li>
          </ul>
          <p className="text-white/60 leading-relaxed">
            Subscription pricing, billing, and payment processing are handled securely using our supported payment providers.
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-white selection:bg-purple-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-20 lg:py-32">
        {/* Navigation */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-12 group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Home
        </Link>

        {/* Header */}
        <header className="mb-16">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
            <Lock className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium uppercase tracking-widest text-purple-400">Security & Privacy</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Privacy <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300">Policy</span>
          </h1>
          <p className="text-white/40 text-lg">
            Last updated on <span className="text-white/60 font-medium">{lastUpdated}</span>
          </p>
        </header>

        {/* Content */}
        <div className="space-y-12">
          {sections.map((section, index) => (
            <section key={index} className="group p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 rounded-xl bg-white/5 border border-white/10">
                  {section.icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-4 group-hover:text-purple-400 transition-colors">
                    {section.title}
                  </h2>
                  <p className="text-white/60 leading-relaxed">
                    {section.content}
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Special Terms & Privacy Policy for Retail Verse POS App Users */}
        <div className="mt-20 mb-12">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6">
            <Smartphone className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium uppercase tracking-widest text-blue-400">POS Application</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Special Terms & Privacy Policy for Retail Verse <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">POS App</span> Users
          </h2>
          <p className="text-white/60 leading-relaxed text-lg mb-10">
            {posIntro}
          </p>

          <div className="space-y-8">
            {posSubsections.map((sub, idx) => (
              <section key={idx} className="group p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 rounded-xl bg-white/5 border border-white/10">
                    {sub.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-4 group-hover:text-blue-400 transition-colors">
                      {sub.title}
                    </h3>
                    {sub.content}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-12 p-8 rounded-3xl border border-dashed border-white/10 text-center">
          <p className="text-white/40 text-sm mb-6">
            Your privacy is important to us. If you have any concerns, please get in touch.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-white text-black font-bold transition-all hover:scale-105 active:scale-95"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
