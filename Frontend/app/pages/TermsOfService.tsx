import { Link } from 'react-router';
import { ArrowLeft, Shield, Scale, FileText, CheckCircle2 } from 'lucide-react';

export function TermsOfService() {
  const lastUpdated = "May 1, 2026";

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: "By accessing and using Retail Verse, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services. We reserve the right to update or modify these terms at any time without prior notice.",
      icon: <CheckCircle2 className="w-5 h-5 text-blue-400" />
    },
    {
      title: "2. User Accounts",
      content: "To access certain features of Retail Verse, you may be required to create an account. You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account. You must be at least 18 years old to create an account.",
      icon: <Shield className="w-5 h-5 text-purple-400" />
    },
    {
      title: "3. Intellectual Property",
      content: "All content on Retail Verse, including text, graphics, logos, images, and software, is the property of Retail Verse or its content suppliers and is protected by international copyright laws. The compilation of all content on this site is the exclusive property of Retail Verse.",
      icon: <FileText className="w-5 h-5 text-cyan-400" />
    },
    {
      title: "4. Limitation of Liability",
      content: "Retail Verse shall not be liable for any direct, indirect, incidental, special, or consequential damages resulting from the use or inability to use our services or for the cost of procurement of substitute goods and services.",
      icon: <Scale className="w-5 h-5 text-emerald-400" />
    },
    {
      title: "5. Governing Law",
      content: "These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Retail Verse operates, without regard to its conflict of law provisions.",
      icon: <Scale className="w-5 h-5 text-amber-400" />
    }
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-white selection:bg-blue-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px]" />
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
            <Scale className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium uppercase tracking-widest text-blue-400">Legal Document</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            Terms of <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Service</span>
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
                  <h2 className="text-xl font-bold mb-4 group-hover:text-blue-400 transition-colors">
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

        {/* Footer info */}
        <div className="mt-20 p-8 rounded-3xl border border-dashed border-white/10 text-center">
          <p className="text-white/40 text-sm mb-6">
            If you have any questions about these Terms, please contact us.
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
