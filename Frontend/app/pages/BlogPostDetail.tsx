import React, { useState } from 'react';
import { useParams, Link } from 'react-router';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  CheckCircle2,
  Quote,
  BookOpen,
  ArrowRight,
  User,
  Sparkles,
} from 'lucide-react';
import { BLOG_POSTS, FALLBACK_BLOG_IMAGE, FALLBACK_AVATAR_IMAGE } from '../data/blogPosts';

const handleBlogImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = FALLBACK_BLOG_IMAGE;
};

const handleAvatarImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = FALLBACK_AVATAR_IMAGE;
};

export function BlogPostDetail() {
  const { id } = useParams<{ id: string }>();
  const [copied, setCopied] = useState(false);

  // Find article by id or slug
  const post = BLOG_POSTS.find((p) => p.id === id || p.slug === id);

  // Get related posts (excluding current post)
  const relatedPosts = BLOG_POSTS.filter((p) => p.id !== post?.id).slice(0, 3);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (!post) {
    return (
      <section className="relative min-h-[70vh] overflow-hidden bg-[#181818] px-4 py-24 text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#121212] p-8 text-center backdrop-blur-xl">
          <BookOpen className="mx-auto h-12 w-12 text-[#d4af5c]" />
          <h1 className="mt-4 text-2xl font-bold text-white">Article Not Found</h1>
          <p className="mt-2 text-sm text-white/60">
            The blog article you are looking for might have been moved or removed.
          </p>
          <Link
            to="/blog"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#D4AF37] to-[#C9A646] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#111111]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to All Articles
          </Link>
        </div>
      </section>
    );
  }

  return (
    <article className="relative overflow-hidden bg-[#181818] text-white">
      {/* Background ambient lighting gradients */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0F0F0F_0%,#2A2A2A_48%,rgba(201,166,70,0.14)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_0%,rgba(212,175,55,0.07),transparent_50%)]" />
        <div className="absolute left-[-18%] top-[-14%] h-[560px] w-[560px] rounded-full bg-[#C9A646]/[0.12] blur-[110px]" />
        <div className="absolute right-[-12%] top-[30%] h-[480px] w-[480px] rounded-full bg-[#D4AF37]/[0.08] blur-[95px]" />
        <div className="absolute inset-0 opacity-[0.038] [background-image:linear-gradient(rgba(201,166,70,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.32)_1px,transparent_1px)] [background-size:80px_80px]" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6 sm:pb-32 sm:pt-14 lg:px-8">
        
        {/* Top Navigation & Actions Bar */}
        <div className="flex items-center justify-between">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 transition-all duration-300 hover:border-[#D4AF37]/40 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 text-[#d4af5c]" />
            Back to Blog
          </Link>

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-full border border-[#C9A646]/25 bg-[#C9A646]/10 px-4 py-2 text-xs font-semibold text-[#e8c96a] backdrop-blur-sm transition-all duration-300 hover:bg-[#C9A646]/20"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? 'Link Copied!' : 'Share Article'}
          </button>
        </div>

        {/* Article Meta Header */}
        <header className="mt-10">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md border border-[#C9A646]/30 bg-[#C9A646]/15 px-3 py-1 font-semibold text-[#e8c96a]">
              {post.category}
            </span>
            <span className="flex items-center gap-1.5 text-white/60">
              <Calendar className="h-3.5 w-3.5 text-[#d4af5c]" />
              {post.date}
            </span>
            <span className="text-white/40">•</span>
            <span className="flex items-center gap-1.5 text-white/60">
              <Clock className="h-3.5 w-3.5 text-[#d4af5c]" />
              {post.readTime}
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
            {post.title}
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-white/75 sm:text-xl">
            {post.excerpt}
          </p>

          {/* Author Badge */}
          <div className="mt-8 flex items-center gap-4 border-y border-white/10 py-5">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-12 w-12 shrink-0 rounded-full border border-[#C9A646]/40 object-cover shadow-[0_0_15px_rgba(201,166,70,0.2)]"
              onError={handleAvatarImageError}
            />
            <div>
              <p className="text-base font-bold text-white">
                {post.author.name}
              </p>
              <p className="text-xs text-[#e8c96a]">
                {post.author.role}
              </p>
            </div>
          </div>
        </header>

        {/* Featured Image */}
        <div className="relative aspect-[16/9] sm:aspect-[21/9] min-h-[260px] max-h-[500px] w-full overflow-hidden rounded-3xl border border-[#C9A646]/20 bg-black/50 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)]">
          <img
            src={post.image}
            alt={post.title}
            className="h-full w-full object-cover"
            onError={handleBlogImageError}
          />
        </div>

        {/* Article Body Content */}
        <div className="mt-12 space-y-10 text-white/80">
          
          {/* Introduction */}
          <p className="text-lg leading-relaxed text-white/90 font-light first-letter:float-left first-letter:mr-3 first-letter:text-5xl first-letter:font-bold first-letter:text-[#D4AF37]">
            {post.content.introduction}
          </p>

          {/* Dynamic Sections */}
          {post.content.sections.map((section, idx) => (
            <section key={idx} className="space-y-4 pt-4">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {section.title}
              </h2>
              <p className="text-base leading-relaxed text-white/75 sm:text-lg">
                {section.content}
              </p>

              {section.bulletPoints && section.bulletPoints.length > 0 && (
                <ul className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-[#121212]/80 p-6 backdrop-blur-md">
                  {section.bulletPoints.map((point, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-3 text-sm sm:text-base text-white/85">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#D4AF37]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Quote Block */}
          {post.content.quote && (
            <div className="my-10 relative overflow-hidden rounded-2xl border border-[#C9A646]/30 bg-gradient-to-r from-[#141414] via-[#1c1a14] to-[#141414] p-8 shadow-[0_16px_32px_rgba(0,0,0,0.5)]">
              <Quote className="h-10 w-10 text-[#D4AF37]/30 absolute top-4 left-4" />
              <div className="relative z-10 pl-6 border-l-2 border-[#D4AF37]">
                <p className="text-lg font-medium italic leading-relaxed text-[#e8c96a] sm:text-xl">
                  "{post.content.quote.text}"
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/60">
                  — {post.content.quote.author}
                </p>
              </div>
            </div>
          )}

          {/* Conclusion */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Key Takeaway & Conclusion
            </h2>
            <p className="text-base leading-relaxed text-white/75 sm:text-lg">
              {post.content.conclusion}
            </p>
          </div>
        </div>

        {/* Author Bio Signature Box */}
        <div className="mt-14 rounded-2xl border border-[#C9A646]/20 bg-[#121212]/90 p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-16 w-16 shrink-0 rounded-full border-2 border-[#D4AF37] object-cover"
              onError={handleAvatarImageError}
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4af5c]">
                Written by
              </span>
              <h3 className="text-xl font-bold text-white">
                {post.author.name}
              </h3>
              <p className="text-xs font-semibold text-white/50">
                {post.author.role}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {post.author.name} writes extensively on retail architecture, digital commerce optimization, and omni-channel customer experiences at Retail Verse.
              </p>
            </div>
          </div>
        </div>

        {/* Related Articles Section */}
        {relatedPosts.length > 0 && (
          <div className="mt-20 border-t border-white/10 pt-16">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#D4AF37]" />
                <h2 className="text-2xl font-bold text-white">
                  More Articles to Explore
                </h2>
              </div>

              <Link
                to="/blog"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#e8c96a] hover:text-white"
              >
                View All
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {relatedPosts.map((relPost) => (
                <article
                  key={relPost.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#121212]/70 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/35"
                >
                  <div className="aspect-video w-full overflow-hidden bg-black/40">
                    <img
                      src={relPost.image}
                      alt={relPost.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={handleBlogImageError}
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#e8c96a]">
                        {relPost.category}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-white line-clamp-2 transition-colors duration-300 group-hover:text-[#e8c96a]">
                        {relPost.title}
                      </h3>
                    </div>

                    <Link
                      to={`/blog/${relPost.id}`}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#d4af5c]"
                    >
                      Read Story
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

      </div>
    </article>
  );
}
