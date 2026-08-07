import React, { useState, useMemo } from 'react';
import { Link } from 'react-router';
import {
  Search,
  Calendar,
  Clock,
  ArrowRight,
  BookOpen,
  Sparkles,
  Filter,
  CheckCircle2,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { BLOG_POSTS, BlogPost, FALLBACK_BLOG_IMAGE, FALLBACK_AVATAR_IMAGE } from '../data/blogPosts';

const handleBlogImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = FALLBACK_BLOG_IMAGE;
};

const handleAvatarImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = FALLBACK_AVATAR_IMAGE;
};

const CATEGORIES = [
  'All',
  'Trends & Insights',
  'Customer Experience',
  'Buying Guides',
  'Technology',
  'Growth & Analytics',
  'Sustainability',
];

export function Blog() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // Filter posts based on category and search query
  const filteredPosts = useMemo(() => {
    return BLOG_POSTS.filter((post) => {
      const matchesCategory =
        selectedCategory === 'All' || post.category === selectedCategory;
      const matchesSearch =
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const featuredPost = useMemo(() => {
    return BLOG_POSTS.find((post) => post.featured) || BLOG_POSTS[0];
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setSubscribed(true);
      setNewsletterEmail('');
      setTimeout(() => setSubscribed(false), 5000);
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#181818] text-white">
      {/* Background ambient lighting gradients matching site design */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0F0F0F_0%,#2A2A2A_48%,rgba(201,166,70,0.14)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_0%,rgba(212,175,55,0.07),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_100%,rgba(201,166,70,0.06),transparent_45%)]" />
        <div className="absolute left-[-18%] top-[-14%] h-[min(560px,95vw)] w-[min(560px,95vw)] rounded-full bg-[#C9A646]/[0.13] blur-[110px]" />
        <div className="absolute right-[-12%] top-[20%] h-[min(480px,85vw)] w-[min(480px,85vw)] rounded-full bg-[#D4AF37]/[0.09] blur-[95px]" />
        <div className="absolute inset-0 opacity-[0.038] [background-image:linear-gradient(rgba(201,166,70,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(212,175,55,0.32)_1px,transparent_1px)] [background-size:80px_80px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-6 sm:pb-32 sm:pt-16 lg:px-8 lg:pb-36 lg:pt-20">
        
        {/* Header Hero Section */}
        <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A646]/26 bg-[#C9A646]/[0.09] px-4 py-2 shadow-[0_0_28px_-8px_rgba(201,166,70,0.32)] backdrop-blur-sm">
            <BookOpen className="h-4 w-4 text-[#d4af5c]" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#e0c46e]">
              Retail Insights & Blog
            </span>
          </div>

          <h1 className="mt-8 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl md:text-6xl lg:text-[3.75rem]">
            Discover the future of{' '}
            <span className="relative inline text-[#e8c96a]">
              smart retail
              <span
                className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C4973F]/70 to-transparent"
                aria-hidden
              />
            </span>
            <span className="mt-1 block bg-gradient-to-r from-[#C4973F] via-[#f0d78c] to-[#C4973F] bg-clip-text text-transparent sm:mt-2">
              & commerce trends
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-[1.75] text-white/68 sm:text-lg sm:leading-8">
            Expert analysis, technology strategies, and practical buying guides to elevate your shopping and retail operations.
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-9 max-w-xl">
            <div className="relative flex items-center overflow-hidden rounded-2xl border border-[#C9A646]/25 bg-[#121212]/80 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 focus-within:border-[#D4AF37]/60 focus-within:shadow-[0_0_25px_rgba(212,175,55,0.2)]">
              <Search className="ml-3.5 h-5 w-5 shrink-0 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles by title, keyword, or topic..."
                className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mr-2 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/20"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-300 sm:px-5 sm:py-2.5 sm:text-sm ${
                  isSelected
                    ? 'border border-[#D4AF37]/50 bg-gradient-to-r from-[#D4AF37] to-[#C9A646] text-[#111111] shadow-[0_4px_16px_rgba(201,166,70,0.35)]'
                    : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Featured Post Hero Card (shown when category is 'All' and no search query active) */}
        {selectedCategory === 'All' && !searchQuery && featuredPost && (
          <div className="mt-14 lg:mt-16">
            <div className="group relative overflow-hidden rounded-[28px] border border-[#C9A646]/20 bg-[#121212]/80 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-500 hover:border-[#D4AF37]/40 hover:shadow-[0_40px_80px_-24px_rgba(201,166,70,0.15)]">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                
                {/* Image side */}
                <div className="relative min-h-[300px] overflow-hidden lg:col-span-7 lg:min-h-[440px]">
                  <img
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    onError={handleBlogImageError}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#121212]/90" />
                  
                  <div className="absolute left-6 top-6 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/30 bg-black/60 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#e8c96a] backdrop-blur-md">
                      <Sparkles className="h-3.5 w-3.5 text-[#D4AF37]" />
                      Featured Story
                    </span>
                  </div>
                </div>

                {/* Content side */}
                <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-5 lg:p-10">
                  <div>
                    <div className="flex items-center gap-3 text-xs text-white/50">
                      <span className="rounded-md border border-[#C9A646]/20 bg-[#C9A646]/10 px-2.5 py-1 font-semibold text-[#e8c96a]">
                        {featuredPost.category}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {featuredPost.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {featuredPost.readTime}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-bold tracking-tight text-white transition-colors duration-300 group-hover:text-[#e8c96a] sm:text-3xl lg:text-3xl">
                      {featuredPost.title}
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-white/65 sm:text-base">
                      {featuredPost.excerpt}
                    </p>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
                    <div className="flex items-center gap-3">
                      <img
                        src={featuredPost.author.avatar}
                        alt={featuredPost.author.name}
                        className="h-10 w-10 shrink-0 rounded-full border border-[#C9A646]/30 object-cover"
                        onError={handleAvatarImageError}
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {featuredPost.author.name}
                        </p>
                        <p className="text-xs text-white/45">
                          {featuredPost.author.role}
                        </p>
                      </div>
                    </div>

                    <Link
                      to={`/blog/${featuredPost.id}`}
                      className="group/btn inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#D4AF37] to-[#C9A646] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#111111] shadow-[0_4px_14px_rgba(201,166,70,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_6px_20px_rgba(201,166,70,0.4)]"
                    >
                      Read Story
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                    </Link>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Blog Post Grid */}
        <div className="mt-14 lg:mt-16">
          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#C9A646]/14 bg-[#121212]/75 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5 hover:border-[#D4AF37]/35 hover:bg-[#161616]/85 hover:shadow-[0_24px_48px_-16px_rgba(201,166,70,0.18)]"
                >
                  {/* Card Thumbnail */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={handleBlogImageError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent opacity-60" />
                    
                    <span className="absolute left-4 top-4 rounded-lg border border-[#C9A646]/25 bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-wider text-[#e8c96a] backdrop-blur-md">
                      {post.category}
                    </span>
                  </div>

                  {/* Card Details */}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-[#d4af5c]" />
                          {post.date}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#d4af5c]" />
                          {post.readTime}
                        </span>
                      </div>

                      <h3 className="mt-3 text-xl font-bold tracking-tight text-white transition-colors duration-300 group-hover:text-[#e8c96a]">
                        {post.title}
                      </h3>

                      <p className="mt-3 text-sm leading-relaxed text-white/60 line-clamp-3">
                        {post.excerpt}
                      </p>
                    </div>

                    <div className="mt-6 border-t border-white/10 pt-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={post.author.avatar}
                            alt={post.author.name}
                            className="h-8 w-8 shrink-0 rounded-full border border-[#C9A646]/30 object-cover"
                            onError={handleAvatarImageError}
                          />
                          <span className="text-xs font-semibold text-white/80">
                            {post.author.name}
                          </span>
                        </div>

                        <Link
                          to={`/blog/${post.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#e8c96a] transition-all duration-200 hover:gap-2 hover:text-[#f0d78c]"
                        >
                          Read More
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mx-auto my-12 max-w-md rounded-2xl border border-white/10 bg-[#121212]/80 p-8 text-center backdrop-blur-xl">
              <Filter className="mx-auto h-12 w-12 text-[#d4af5c]/60" />
              <h3 className="mt-4 text-xl font-bold text-white">No articles found</h3>
              <p className="mt-2 text-sm text-white/60">
                We couldn't find any blog posts matching your search criteria.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#D4AF37] to-[#C9A646] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#111111]"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Newsletter Call to Action Section */}
        <div className="mt-24 lg:mt-32">
          <div className="relative overflow-hidden rounded-[28px] border border-[#C9A646]/20 bg-gradient-to-r from-[#141414] via-[#1a1a1a] to-[#141414] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:p-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-3xl" />
            
            <div className="relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A646]/25 bg-[#C9A646]/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#e8c96a]">
                  <Mail className="h-3.5 w-3.5" />
                  Stay Ahead of the Curve
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
                  Subscribe to Retail Verse Digest
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
                  Get our weekly curated analysis on e-commerce technology, luxury retail strategies, and market growth insights delivered straight to your inbox.
                </p>
              </div>

              <div className="lg:col-span-5">
                {subscribed ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#C9A646]/40 bg-[#C9A646]/15 p-4 text-sm text-[#e8c96a]">
                    <CheckCircle2 className="h-5 w-5 text-[#D4AF37]" />
                    <span>Thank you for subscribing! Check your inbox soon.</span>
                  </div>
                ) : (
                  <form onSubmit={handleSubscribe} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="email"
                      required
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      placeholder="Enter your email address..."
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white placeholder:text-white/40 focus:border-[#D4AF37] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/40 bg-gradient-to-r from-[#D4AF37] to-[#C9A646] px-6 text-sm font-bold text-[#111111] shadow-[0_4px_15px_rgba(201,166,70,0.3)] transition-all duration-300 hover:scale-105"
                    >
                      Subscribe
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </form>
                )}
                <p className="mt-3 text-xs text-white/40">
                  We respect your privacy. Unsubscribe anytime with one click.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
