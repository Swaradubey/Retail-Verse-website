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
      <section className="relative min-h-[70vh] overflow-hidden bg-[#F8FAFC] px-4 py-24 text-[#0B1F3A] flex items-center justify-center">
        <div className="mx-auto max-w-md rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-8 text-center shadow-lg">
          <BookOpen className="mx-auto h-12 w-12 text-[#2563EB]" />
          <h1 className="mt-4 text-2xl font-bold text-[#0B1F3A]">Article Not Found</h1>
          <p className="mt-2 text-sm text-[#0B1F3A]/70">
            The blog article you are looking for might have been moved or removed.
          </p>
          <Link
            to="/blog"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] hover:bg-[#2563EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F8FAFC] shadow-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to All Articles
          </Link>
        </div>
      </section>
    );
  }

  return (
    <article className="relative overflow-hidden bg-[#F8FAFC] text-[#0B1F3A] min-h-screen">
      <div className="relative mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-6 sm:pb-32 sm:pt-14 lg:px-8">
        
        {/* Top Navigation & Actions Bar */}
        <div className="flex items-center justify-between">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-[#0B1F3A]/20 bg-[#F8FAFC] px-4 py-2 text-xs font-bold text-[#0B1F3A] transition-all duration-200 hover:bg-[#0B1F3A] hover:text-[#F8FAFC] shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-[#2563EB]" />
            Back to Blog
          </Link>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-full border border-[#2563EB] bg-[#2563EB] px-4 py-2 text-xs font-bold text-[#F8FAFC] transition-all duration-200 hover:bg-[#FF6B00] hover:border-[#FF6B00] shadow-sm"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? 'Link Copied!' : 'Share Article'}
          </button>
        </div>

        {/* Article Meta Header */}
        <header className="mt-10">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md border border-[#2563EB] bg-[#2563EB] px-3 py-1 font-bold text-[#F8FAFC]">
              {post.category}
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[#0B1F3A]/70">
              <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
              {post.date}
            </span>
            <span className="text-[#0B1F3A]/30">•</span>
            <span className="flex items-center gap-1.5 font-medium text-[#0B1F3A]/70">
              <Clock className="h-3.5 w-3.5 text-[#2563EB]" />
              {post.readTime}
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#0B1F3A] sm:text-4xl md:text-5xl">
            {post.title}
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-[#0B1F3A]/75 sm:text-xl font-normal">
            {post.excerpt}
          </p>

          {/* Author Badge */}
          <div className="mt-8 flex items-center gap-4 border-y border-[#0B1F3A]/15 py-5">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-[#2563EB] object-cover shadow-sm"
              onError={handleAvatarImageError}
            />
            <div>
              <p className="text-base font-bold text-[#0B1F3A]">
                {post.author.name}
              </p>
              <p className="text-xs font-semibold text-[#FF6B00]">
                {post.author.role}
              </p>
            </div>
          </div>
        </header>

        {/* Featured Image */}
        <div className="mt-10 relative aspect-[16/9] sm:aspect-[21/9] min-h-[260px] max-h-[500px] w-full overflow-hidden rounded-3xl border-2 border-[#0B1F3A] bg-[#0B1F3A]/5 shadow-xl">
          <img
            src={post.image}
            alt={post.title}
            className="h-full w-full object-cover"
            onError={handleBlogImageError}
          />
        </div>

        {/* Article Body Content */}
        <div className="mt-12 space-y-10 text-[#0B1F3A]">
          
          {/* Introduction */}
          <p className="text-lg leading-relaxed text-[#0B1F3A]/85 font-normal first-letter:float-left first-letter:mr-3 first-letter:text-5xl first-letter:font-extrabold first-letter:text-[#FF6B00]">
            {post.content.introduction}
          </p>

          {/* Dynamic Sections */}
          {post.content.sections.map((section, idx) => (
            <section key={idx} className="space-y-4 pt-4">
              <h2 className="text-2xl font-bold tracking-tight text-[#0B1F3A] sm:text-3xl">
                {section.title}
              </h2>
              <p className="text-base leading-relaxed text-[#0B1F3A]/80 sm:text-lg">
                {section.content}
              </p>

              {section.bulletPoints && section.bulletPoints.length > 0 && (
                <ul className="mt-4 space-y-3 rounded-2xl border border-[#0B1F3A]/15 bg-[#F8FAFC] p-6 shadow-sm">
                  {section.bulletPoints.map((point, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-3 text-sm sm:text-base text-[#0B1F3A]">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#2563EB]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Quote Block */}
          {post.content.quote && (
            <div className="my-10 relative overflow-hidden rounded-2xl border-2 border-[#0B1F3A] bg-[#0B1F3A] text-[#F8FAFC] p-8 shadow-xl">
              <Quote className="h-10 w-10 text-[#FF6B00]/40 absolute top-4 left-4" />
              <div className="relative z-10 pl-6 border-l-4 border-[#FF6B00]">
                <p className="text-lg font-medium italic leading-relaxed text-[#F8FAFC] sm:text-xl">
                  "{post.content.quote.text}"
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[#FF6B00]">
                  — {post.content.quote.author}
                </p>
              </div>
            </div>
          )}

          {/* Conclusion */}
          <div className="space-y-4 pt-4 border-t border-[#0B1F3A]/15">
            <h2 className="text-2xl font-bold tracking-tight text-[#0B1F3A]">
              Key Takeaway & Conclusion
            </h2>
            <p className="text-base leading-relaxed text-[#0B1F3A]/80 sm:text-lg">
              {post.content.conclusion}
            </p>
          </div>
        </div>

        {/* Author Bio Signature Box */}
        <div className="mt-14 rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-6 shadow-md sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="h-16 w-16 shrink-0 rounded-full border-2 border-[#2563EB] object-cover"
              onError={handleAvatarImageError}
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF6B00]">
                Written by
              </span>
              <h3 className="text-xl font-bold text-[#0B1F3A]">
                {post.author.name}
              </h3>
              <p className="text-xs font-semibold text-[#2563EB]">
                {post.author.role}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#0B1F3A]/70">
                {post.author.name} writes extensively on retail architecture, digital commerce optimization, and omni-channel customer experiences at Retail Verse.
              </p>
            </div>
          </div>
        </div>

        {/* Related Articles Section */}
        {relatedPosts.length > 0 && (
          <div className="mt-20 border-t border-[#0B1F3A]/15 pt-16">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#FF6B00]" />
                <h2 className="text-2xl font-bold text-[#0B1F3A]">
                  More Articles to Explore
                </h2>
              </div>

              <Link
                to="/blog"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] hover:text-[#FF6B00] transition-colors"
              >
                View All
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {relatedPosts.map((relPost) => (
                <article
                  key={relPost.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-[#0B1F3A]/15 bg-[#F8FAFC] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#2563EB] hover:shadow-lg"
                >
                  <div className="aspect-video w-full overflow-hidden bg-[#0B1F3A]/5">
                    <img
                      src={relPost.image}
                      alt={relPost.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={handleBlogImageError}
                    />
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
                        {relPost.category}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-[#0B1F3A] line-clamp-2 transition-colors duration-200 group-hover:text-[#2563EB]">
                        {relPost.title}
                      </h3>
                    </div>

                    <Link
                      to={`/blog/${relPost.id}`}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] group-hover:text-[#FF6B00] transition-colors"
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
