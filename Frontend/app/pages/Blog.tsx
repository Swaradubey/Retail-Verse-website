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
    <section className="relative overflow-hidden bg-[#F8FAFC] text-[#0B1F3A] min-h-screen">
      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-6 sm:pb-32 sm:pt-16 lg:px-8 lg:pb-36 lg:pt-20">
        
        {/* Header Hero Section */}
        <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2563EB] bg-[#2563EB] px-4 py-1.5 shadow-sm">
            <BookOpen className="h-4 w-4 text-[#F8FAFC]" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F8FAFC]">
              Retail Insights & Blog
            </span>
          </div>

          <h1 className="mt-8 text-4xl sm:text-5xl md:text-6xl lg:text-[3.5rem] font-extrabold leading-[1.08] tracking-tight text-[#0B1F3A]">
            Discover the future of{' '}
            <span className="text-[#FF6B00]">smart retail</span>
            <span className="mt-2 block text-[#2563EB]">
              & commerce trends
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-[#0B1F3A]/75 font-normal">
            Expert analysis, technology strategies, and practical buying guides to elevate your shopping and retail operations.
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-9 max-w-xl">
            <div className="relative flex items-center overflow-hidden rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-1.5 shadow-md focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition-all duration-200">
              <Search className="ml-3.5 h-5 w-5 shrink-0 text-[#2563EB]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles by title, keyword, or topic..."
                className="w-full bg-transparent px-3 py-2.5 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mr-2 rounded-lg bg-[#0B1F3A]/10 px-2.5 py-1 text-xs font-semibold text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-[#F8FAFC] transition-colors"
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
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-5 py-2.5 text-xs sm:text-sm font-bold tracking-wide transition-all duration-200 ${
                  isSelected
                    ? 'border border-[#2563EB] bg-[#2563EB] text-[#F8FAFC] shadow-md shadow-[#2563EB]/25'
                    : 'border border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A]/80 hover:border-[#2563EB] hover:text-[#2563EB]'
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
            <div className="group relative overflow-hidden rounded-[28px] border-2 border-[#0B1F3A] bg-[#F8FAFC] shadow-xl transition-all duration-300 hover:border-[#2563EB] hover:shadow-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                
                {/* Image side */}
                <div className="relative min-h-[300px] overflow-hidden lg:col-span-7 lg:min-h-[440px]">
                  <img
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    onError={handleBlogImageError}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/60 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#0B1F3A]/30" />
                  
                  <div className="absolute left-6 top-6 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B00] bg-[#FF6B00] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#F8FAFC] shadow-md">
                      <Sparkles className="h-3.5 w-3.5 text-[#F8FAFC]" />
                      Featured Story
                    </span>
                  </div>
                </div>

                {/* Content side */}
                <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-5 lg:p-10">
                  <div>
                    <div className="flex items-center gap-3 text-xs text-[#0B1F3A]/70">
                      <span className="rounded-md border border-[#2563EB] bg-[#2563EB] px-2.5 py-1 font-bold text-[#F8FAFC]">
                        {featuredPost.category}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
                        {featuredPost.date}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5 text-[#2563EB]" />
                        {featuredPost.readTime}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#0B1F3A] transition-colors duration-200 group-hover:text-[#2563EB] sm:text-3xl lg:text-3xl">
                      {featuredPost.title}
                    </h2>

                    <p className="mt-4 text-sm leading-relaxed text-[#0B1F3A]/75 sm:text-base">
                      {featuredPost.excerpt}
                    </p>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-[#0B1F3A]/15 pt-6">
                    <div className="flex items-center gap-3">
                      <img
                        src={featuredPost.author.avatar}
                        alt={featuredPost.author.name}
                        className="h-10 w-10 shrink-0 rounded-full border-2 border-[#2563EB] object-cover"
                        onError={handleAvatarImageError}
                      />
                      <div>
                        <p className="text-sm font-bold text-[#0B1F3A]">
                          {featuredPost.author.name}
                        </p>
                        <p className="text-xs text-[#0B1F3A]/60">
                          {featuredPost.author.role}
                        </p>
                      </div>
                    </div>

                    <Link
                      to={`/blog/${featuredPost.id}`}
                      className="group/btn inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] hover:bg-[#2563EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F8FAFC] shadow-md transition-all duration-200"
                    >
                      Read Story
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
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
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[#0B1F3A]/15 bg-[#F8FAFC] shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#2563EB] hover:shadow-xl"
                >
                  {/* Card Thumbnail */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0B1F3A]/5">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={handleBlogImageError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/50 via-transparent to-transparent opacity-60" />
                    
                    <span className="absolute left-4 top-4 rounded-lg bg-[#0B1F3A] px-3 py-1 text-[11px] font-bold tracking-wider text-[#F8FAFC] shadow-sm">
                      {post.category}
                    </span>
                  </div>

                  {/* Card Details */}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div>
                      <div className="flex items-center gap-3 text-xs text-[#0B1F3A]/70">
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
                          {post.date}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="h-3.5 w-3.5 text-[#2563EB]" />
                          {post.readTime}
                        </span>
                      </div>

                      <h3 className="mt-3 text-xl font-bold tracking-tight text-[#0B1F3A] transition-colors duration-200 group-hover:text-[#2563EB]">
                        {post.title}
                      </h3>

                      <p className="mt-3 text-sm leading-relaxed text-[#0B1F3A]/70 line-clamp-3">
                        {post.excerpt}
                      </p>
                    </div>

                    <div className="mt-6 border-t border-[#0B1F3A]/15 pt-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={post.author.avatar}
                            alt={post.author.name}
                            className="h-8 w-8 shrink-0 rounded-full border border-[#2563EB] object-cover"
                            onError={handleAvatarImageError}
                          />
                          <span className="text-xs font-semibold text-[#0B1F3A]">
                            {post.author.name}
                          </span>
                        </div>

                        <Link
                          to={`/blog/${post.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#FF6B00] transition-all duration-200 hover:gap-2 hover:text-[#2563EB]"
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
            <div className="mx-auto my-12 max-w-md rounded-2xl border border-[#0B1F3A]/20 bg-[#F8FAFC] p-8 text-center shadow-md">
              <Filter className="mx-auto h-12 w-12 text-[#2563EB]" />
              <h3 className="mt-4 text-xl font-bold text-[#0B1F3A]">No articles found</h3>
              <p className="mt-2 text-sm text-[#0B1F3A]/70">
                We couldn't find any blog posts matching your search criteria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF6B00] hover:bg-[#2563EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#F8FAFC] shadow-sm transition-colors"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Newsletter Call to Action Section */}
        <div className="mt-24 lg:mt-32">
          <div className="relative overflow-hidden rounded-[28px] border border-[#0B1F3A] bg-[#0B1F3A] p-8 shadow-2xl sm:p-12 text-[#F8FAFC]">
            <div className="relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FF6B00] bg-[#FF6B00] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#F8FAFC]">
                  <Mail className="h-3.5 w-3.5" />
                  Stay Ahead of the Curve
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#F8FAFC] sm:text-3xl lg:text-4xl">
                  Subscribe to Retail Verse Digest
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#F8FAFC]/80 sm:text-base font-normal">
                  Get our weekly curated analysis on e-commerce technology, luxury retail strategies, and market growth insights delivered straight to your inbox.
                </p>
              </div>

              <div className="lg:col-span-5">
                {subscribed ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-[#2563EB] bg-[#2563EB]/20 p-4 text-sm font-semibold text-[#F8FAFC]">
                    <CheckCircle2 className="h-5 w-5 text-[#FF6B00]" />
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
                      className="h-12 w-full rounded-xl border border-[#0B1F3A]/20 bg-[#F8FAFC] px-4 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/40 focus:border-[#2563EB] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] hover:bg-[#2563EB] px-6 text-sm font-bold text-[#F8FAFC] shadow-md transition-all duration-200"
                    >
                      Subscribe
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </form>
                )}
                <p className="mt-3 text-xs text-[#F8FAFC]/60">
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
