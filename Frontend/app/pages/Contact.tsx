import React, { useState } from "react";
import {
  Mail,
  MapPin,
  Phone,
  Clock3,
  ArrowRight,
  MessageSquareText,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { contactApi } from "../api/contact";

// ─── Static data ──────────────────────────────────────────────────────────────

const contactCards = [
  {
    icon: Mail,
    eyebrow: "Email us",
    title: "retailverse@gmail.com",
    desc: "For support, order help, or partnership queries.",
    href: "mailto:hello@retailverse.com",
  },
  {
    icon: Phone,
    eyebrow: "Call us",
    title: "+1 (555) 000-0000",
    desc: "Available Monday to Friday, 9 AM to 6 PM.",
    href: "tel:+15550000000",
  },
  {
    icon: MapPin,
    eyebrow: "Visit us",
    title: "100 Smith Street",
    desc: "Collingwood VIC 3066, India",
  },
  {
    icon: Clock3,
    eyebrow: "Business hours",
    title: "Mon – Fri",
    desc: "9:00 AM – 6:00 PM",
  },
];

const faqs = [
  {
    q: "What are your support hours?",
    a: "Our team is available Monday through Friday from 9 AM to 6 PM, and we usually respond within 24 hours.",
  },
  {
    q: "Do you offer international shipping?",
    a: "Yes, we ship internationally. Delivery timelines and charges vary depending on the destination.",
  },
  {
    q: "Can I return my order?",
    a: "Yes, eligible unused items can be returned within 30 days of delivery through our returns process.",
  },
  {
    q: "How do I track my shipment?",
    a: "Once your order has shipped, we'll send you a confirmation email with your tracking link.",
  },
];

// ─── Initial form state ───────────────────────────────────────────────────────

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
};

/** Shared field styles: consistent height, focus ring, readable on dark bg */
const inputClassName =
  "h-[52px] w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3 text-[15px] leading-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/35 outline-none transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.045] focus:border-[#C4973F]/45 focus:bg-white/[0.06] focus:shadow-[inset_0_0_0_1px_rgba(196,151,63,0.15),0_0_0_3px_rgba(196,151,63,0.12)] disabled:cursor-not-allowed disabled:opacity-50";

const textareaClassName =
  "min-h-[160px] w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-3.5 text-[15px] leading-relaxed text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] placeholder:text-white/35 outline-none transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.045] focus:border-[#C4973F]/45 focus:bg-white/[0.06] focus:shadow-[inset_0_0_0_1px_rgba(196,151,63,0.15),0_0_0_3px_rgba(196,151,63,0.12)] disabled:cursor-not-allowed disabled:opacity-50";

const labelClassName =
  "block text-[13px] font-medium tracking-wide text-white/75";

// ─── Sub-components ────────────────────────────────────────────────────────────

function ContactInfoCard({
  icon: Icon,
  eyebrow,
  title,
  desc,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  desc: string;
  href?: string;
}) {
  const content = (
    <div className="group relative overflow-hidden rounded-2xl border border-[#C9A646]/14 bg-[#121212]/75 p-6 shadow-[0_1px_0_rgba(201,166,70,0.12)_inset,0_24px_48px_-24px_rgba(0,0,0,0.55),0_0_48px_-24px_rgba(201,166,70,0.08)] backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#D4AF37]/28 hover:bg-[#161616]/85 hover:shadow-[0_1px_0_rgba(212,175,55,0.14)_inset,0_20px_40px_-12px_rgba(201,166,70,0.14)]">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#C9A646]/18 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/25 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#C9A646]/28 bg-gradient-to-br from-[#D4AF37]/22 to-[#C9A646]/08 text-[#e8d089] shadow-[0_0_24px_-4px_rgba(201,166,70,0.4)] transition-transform duration-300 group-hover:scale-[1.02]">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-base font-semibold tracking-tight text-white sm:text-lg">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/58">{desc}</p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A646]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0F0F]">
        {content}
      </a>
    );
  }

  return content;
}

function FaqCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="group rounded-2xl border border-[#C9A646]/12 bg-[#121212]/70 p-6 shadow-[0_1px_0_rgba(201,166,70,0.1)_inset,0_0_40px_-20px_rgba(201,166,70,0.06)] backdrop-blur-xl transition-all duration-300 hover:border-[#D4AF37]/24 hover:bg-[#161616]/78">
      <h4 className="text-base font-semibold tracking-tight text-white sm:text-lg">
        {q}
      </h4>
      <p className="mt-3 text-sm leading-7 text-white/60">{a}</p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function Contact() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
    // Clear banners on new input
    if (success) setSuccess(null);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    setIsLoading(true);

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        phone: form.phone,
        subject: form.subject,
        message: form.message,
      };

      console.log("[Frontend Debug] Submitting URL: /api/contact");
      console.log("[Frontend Debug] Payload:", payload);

      const response = await contactApi.submit(payload);

      if (response.success) {
        setSuccess(response.message || "Message sent successfully!");
        setForm(INITIAL_FORM);
      } else {
        throw new Error(response.message || "Failed to send message.");
      }
    } catch (err: any) {
      console.error("[Frontend Debug] Fetch/Axios error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#181818] text-white">
      {/* Premium dark + gold gradient layers (scoped to Contact only) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0F0F0F_0%,#2A2A2A_48%,rgba(201,166,70,0.14)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_0%,rgba(212,175,55,0.07),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_100%,rgba(201,166,70,0.06),transparent_45%)]" />
        <div className="absolute left-[-18%] top-[-14%] h-[min(560px,95vw)] w-[min(560px,95vw)] rounded-full bg-[#C9A646]/[0.13] blur-[110px]" />
        <div className="absolute right-[-12%] top-[20%] h-[min(480px,85vw)] w-[min(480px,85vw)] rounded-full bg-[#D4AF37]/[0.09] blur-[95px]" />
        <div className="absolute bottom-[-22%] left-1/2 h-[min(440px,50vh)] w-[min(900px,120%)] max-w-[120%] -translate-x-1/2 rounded-full bg-[#C9A646]/[0.08] blur-[130px]" />
        <div className="absolute left-[12%] top-[36%] h-[min(300px,40vw)] w-[min(300px,40vw)] rounded-full bg-[#D4AF37]/[0.06] blur-[100px]" />
        <div className="absolute right-[6%] bottom-[22%] h-[min(260px,35vw)] w-[min(260px,35vw)] rounded-full bg-[#C9A646]/[0.07] blur-[90px]" />
        <div className="absolute inset-0 opacity-[0.038] [background-image:linear-gradient(rgba(201,166,70,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.32)_1px,transparent_1px)] [background-size:80px_80px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_45%_at_50%_-8%,rgba(212,175,55,0.095),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(15,15,15,0.52)_100%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-16 sm:px-6 sm:pb-32 sm:pt-20 lg:px-8 lg:pb-40 lg:pt-24">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A646]/26 bg-[#C9A646]/[0.09] px-4 py-2 shadow-[0_0_28px_-8px_rgba(201,166,70,0.32)] backdrop-blur-sm">
            <MessageSquareText className="h-4 w-4 text-[#d4af5c]" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#e0c46e]">
              Contact us
            </span>
          </div>

          <h1 className="mt-8 text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white min-[400px]:text-[2.35rem] sm:text-5xl md:text-6xl lg:text-[3.5rem]">
            Let&apos;s create a{" "}
            <span className="relative inline text-[#e8c96a]">
              better
              <span
                className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4973F]/70 to-transparent"
                aria-hidden
              />
            </span>
            <span className="mt-1 block bg-gradient-to-r from-[#C4973F] via-[#f0d78c] to-[#C4973F] bg-clip-text text-transparent sm:mt-2">
              shopping experience
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-[15px] leading-[1.75] text-white/68 sm:mt-8 sm:text-lg sm:leading-8">
            Questions about orders, shipping, returns, or partnerships? Our team
            is here to deliver thoughtful support with a fast and seamless
            experience.
          </p>
        </div>

        {/* Main — two columns desktop, stacked mobile; form has left rule on lg */}
        <div className="mt-14 lg:mt-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
            {/* Left — contact cards */}
            <aside className="lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-1 lg:gap-4">
                  {contactCards.map((card) => (
                    <ContactInfoCard key={card.title} {...card} />
                  ))}
                </div>
              </div>
            </aside>

            {/* Right — form card */}
            <div className="lg:col-span-7 lg:border-l lg:border-[#C9A646]/14 lg:pl-12 xl:pl-14">
              <div className="relative overflow-hidden rounded-[28px] border border-[#C9A646]/16 bg-[#141414]/72 p-6 shadow-[0_1px_0_rgba(212,175,55,0.1)_inset,0_32px_64px_-32px_rgba(0,0,0,0.68),0_0_60px_-20px_rgba(201,166,70,0.12)] backdrop-blur-2xl sm:p-8 lg:p-10">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_100%_0%,rgba(212,175,55,0.14),transparent_55%)]"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -inset-px rounded-[28px] shadow-[0_0_80px_-30px_rgba(201,166,70,0.15)]"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent"
                  aria-hidden
                />

                <div className="relative z-10">
                  <div className="mb-8 border-b border-white/[0.07] pb-8">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d4af5c]">
                      Send a message
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      We&apos;d love to hear from you
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-7 text-white/58 sm:text-[15px]">
                      Complete the form and our team will get back to you as soon
                      as possible.
                    </p>
                  </div>

                  {success && (
                    <div
                      className="mb-6 flex items-start gap-3 rounded-xl border border-[#C4973F]/28 bg-[#C4973F]/[0.09] px-4 py-3.5 text-sm text-[#f0e6c8] shadow-[0_0_24px_-8px_rgba(196,151,63,0.25)]"
                      role="status"
                    >
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#C4973F]" />
                      <span>{success}</span>
                    </div>
                  )}

                  {error && (
                    <div
                      className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-500/[0.08] px-4 py-3.5 text-sm text-red-200"
                      role="alert"
                    >
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="firstName" className={labelClassName}>
                          First Name <span className="text-[#C4973F]">*</span>
                        </label>
                        <input
                          id="firstName"
                          type="text"
                          placeholder="Jane"
                          required
                          value={form.firstName}
                          onChange={handleChange}
                          disabled={isLoading}
                          className={inputClassName}
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="lastName" className={labelClassName}>
                          Last Name
                        </label>
                        <input
                          id="lastName"
                          type="text"
                          placeholder="Doe"
                          value={form.lastName}
                          onChange={handleChange}
                          disabled={isLoading}
                          className={inputClassName}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="email" className={labelClassName}>
                          Email Address <span className="text-[#C4973F]">*</span>
                        </label>
                        <input
                          id="email"
                          type="email"
                          placeholder="jane@example.com"
                          required
                          value={form.email}
                          onChange={handleChange}
                          disabled={isLoading}
                          className={inputClassName}
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="phone" className={labelClassName}>
                          Phone Number
                        </label>
                        <input
                          id="phone"
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={form.phone}
                          onChange={handleChange}
                          disabled={isLoading}
                          className={inputClassName}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="subject" className={labelClassName}>
                        Subject
                      </label>
                      <input
                        id="subject"
                        type="text"
                        placeholder="How can we help you?"
                        value={form.subject}
                        onChange={handleChange}
                        disabled={isLoading}
                        className={inputClassName}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="message" className={labelClassName}>
                        Message <span className="text-[#C4973F]">*</span>
                      </label>
                      <textarea
                        id="message"
                        rows={6}
                        placeholder="Tell us more about your inquiry..."
                        required
                        value={form.message}
                        onChange={handleChange}
                        disabled={isLoading}
                        className={textareaClassName}
                      />
                    </div>

                    <div className="flex flex-col gap-5 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                      <p className="max-w-md text-[13px] leading-6 text-white/48">
                        By submitting this form, you agree to our{" "}
                        <a
                          href="#"
                          className="text-white/80 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-[#C4973F]/60"
                        >
                          Privacy Policy
                        </a>
                        .
                      </p>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="group inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/35 bg-gradient-to-b from-[#D4AF37] to-[#C9A646] px-8 text-[15px] font-semibold text-[#14110a] shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_8px_24px_-4px_rgba(201,166,70,0.48),0_0_0_1px_rgba(212,175,55,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.32)_inset,0_12px_32px_-4px_rgba(212,175,55,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0F0F] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65 disabled:hover:translate-y-0 sm:min-w-[220px]"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Sending…
                          </>
                        ) : (
                          <>
                            Send Message
                            <ArrowRight
                              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                              aria-hidden
                            />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="relative mx-auto mt-24 max-w-6xl border-t border-[#C9A646]/14 pt-20 lg:mt-28 lg:pt-28">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-[#D4AF37]/[0.06] blur-[70px]"
            aria-hidden
          />
          <div className="mb-10 text-center sm:mb-14">
            <div className="inline-flex rounded-full border border-[#C9A646]/22 bg-[#C9A646]/[0.08] px-4 py-2 backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#e0c46e]">
                Support FAQ
              </span>
            </div>

            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-[2.75rem] md:leading-tight">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-white/60 sm:text-lg">
              Everything you might want to know before reaching out.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            {faqs.map((item) => (
              <FaqCard key={item.q} {...item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
