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

/** Shared field styles: consistent height, focus ring, readable on light bg */
const inputClassName =
  "h-[52px] w-full rounded-xl border border-[#0B1F3A]/20 bg-[#F8FAFC] px-4 py-3 text-[15px] leading-normal text-[#0B1F3A] shadow-sm placeholder:text-[#0B1F3A]/40 outline-none transition-all duration-200 hover:border-[#2563EB]/50 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:cursor-not-allowed disabled:opacity-50";

const textareaClassName =
  "min-h-[160px] w-full resize-none rounded-xl border border-[#0B1F3A]/20 bg-[#F8FAFC] px-4 py-3.5 text-[15px] leading-relaxed text-[#0B1F3A] shadow-sm placeholder:text-[#0B1F3A]/40 outline-none transition-all duration-200 hover:border-[#2563EB]/50 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:cursor-not-allowed disabled:opacity-50";

const labelClassName =
  "block text-[13px] font-bold tracking-wide text-[#0B1F3A]";

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
    <div className="group relative overflow-hidden rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-6 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#2563EB] hover:shadow-xl">
      <div className="relative z-10 flex gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-[#F8FAFC] shadow-md transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF6B00]">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-base font-bold tracking-tight text-[#0B1F3A] sm:text-lg">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#0B1F3A]/65">{desc}</p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
      >
        {content}
      </a>
    );
  }

  return content;
}

function FaqCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="group rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-6 shadow-sm transition-all duration-200 hover:border-[#2563EB] hover:shadow-md">
      <h4 className="text-base font-bold tracking-tight text-[#0B1F3A] sm:text-lg">
        {q}
      </h4>
      <p className="mt-3 text-sm leading-7 text-[#0B1F3A]/70 font-normal">{a}</p>
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
    <section className="relative overflow-hidden bg-[#F8FAFC] text-[#0B1F3A] min-h-screen">
      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-16 sm:px-6 sm:pb-32 sm:pt-20 lg:px-8 lg:pb-40 lg:pt-24">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2563EB] bg-[#2563EB] px-4 py-1.5 shadow-sm">
            <MessageSquareText className="h-4 w-4 text-[#F8FAFC]" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F8FAFC]">
              Contact us
            </span>
          </div>

          <h1 className="mt-8 text-4xl sm:text-5xl md:text-6xl lg:text-[3.5rem] font-extrabold leading-[1.08] tracking-tight text-[#0B1F3A]">
            Let&apos;s create a{" "}
            <span className="text-[#FF6B00]">better</span>
            <span className="mt-2 block text-[#2563EB]">
              shopping experience
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-base sm:text-lg leading-relaxed text-[#0B1F3A]/75 font-normal">
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
            <div className="lg:col-span-7 lg:border-l lg:border-[#0B1F3A]/15 lg:pl-12 xl:pl-14">
              <div className="relative overflow-hidden rounded-[28px] border-2 border-[#0B1F3A] bg-[#F8FAFC] p-6 shadow-xl sm:p-8 lg:p-10">
                <div className="relative z-10">
                  <div className="mb-8 border-b border-[#0B1F3A]/15 pb-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">
                      Send a message
                    </p>
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
                      We&apos;d love to hear from you
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#0B1F3A]/70 sm:text-[15px]">
                      Complete the form and our team will get back to you as soon
                      as possible.
                    </p>
                  </div>

                  {success && (
                    <div
                      className="mb-6 flex items-start gap-3 rounded-xl border border-[#2563EB] bg-[#2563EB]/10 px-4 py-3.5 text-sm font-semibold text-[#0B1F3A]"
                      role="status"
                    >
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
                      <span>{success}</span>
                    </div>
                  )}

                  {error && (
                    <div
                      className="mb-6 flex items-start gap-3 rounded-xl border border-[#FF6B00] bg-[#FF6B00]/10 px-4 py-3.5 text-sm font-semibold text-[#0B1F3A]"
                      role="alert"
                    >
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#FF6B00]" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="firstName" className={labelClassName}>
                          First Name <span className="text-[#FF6B00]">*</span>
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
                          Email Address <span className="text-[#FF6B00]">*</span>
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
                        Message <span className="text-[#FF6B00]">*</span>
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

                    <div className="flex flex-col gap-5 border-t border-[#0B1F3A]/15 pt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                      <p className="max-w-md text-[13px] leading-6 text-[#0B1F3A]/60">
                        By submitting this form, you agree to our{" "}
                        <a
                          href="#"
                          className="text-[#2563EB] font-bold underline underline-offset-4 transition-colors hover:text-[#FF6B00]"
                        >
                          Privacy Policy
                        </a>
                        .
                      </p>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="group inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] hover:bg-[#2563EB] px-8 text-[15px] font-bold text-[#F8FAFC] shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[220px]"
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
                              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
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
        <div className="relative mx-auto mt-24 max-w-6xl border-t border-[#0B1F3A]/15 pt-20 lg:mt-28 lg:pt-28">
          <div className="mb-10 text-center sm:mb-14">
            <div className="inline-flex rounded-full border border-[#2563EB] bg-[#2563EB] px-4 py-1.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F8FAFC]">
                Support FAQ
              </span>
            </div>

            <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-[#0B1F3A] sm:text-4xl md:text-[2.75rem] md:leading-tight">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-[#0B1F3A]/70">
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
