import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router';
import { useAuth, resetNavigationState } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { resolvePostLoginPath } from '../../utils/staffRoles';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ShoppingBag } from 'lucide-react';

export function Login() {
  const [searchParams] = useSearchParams();
  const urlEmail = searchParams.get('email') || '';
  const emailFromUrl = urlEmail.trim() ? urlEmail : '';
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const { login } = useAuth();
  const { brandName, updateBranding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'google_auth_failed') {
      setError('Google authentication failed. Please try again or use your credentials.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!acceptTerms) {
      setError('Please accept Terms of Service and Privacy Policy.');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await login(email, password);
      if (data.role === 'client' && data.businessName) {
        updateBranding({
          businessName: data.businessName,
          clientId: data.clientId || undefined,
        });
      }
      resetNavigationState();
      const fromState = location.state?.from;
      const intendedPath = typeof fromState === 'string'
        ? fromState
        : (typeof fromState === 'object' && fromState !== null
          ? fromState.pathname
          : null);
      const redirectParam = searchParams.get('redirect');
      const requestedRedirect = intendedPath || redirectParam;
      const isSafeInternalRedirect =
        requestedRedirect &&
        requestedRedirect.startsWith('/') &&
        !requestedRedirect.startsWith('//') &&
        !requestedRedirect.includes('://') &&
        requestedRedirect !== '/login' &&
        requestedRedirect !== '/register';
      if (isSafeInternalRedirect) {
        navigate(requestedRedirect, { replace: true });
      } else {
        navigate(resolvePostLoginPath(data.role, '/'), { replace: true });
      }
    } catch (err: unknown) {
      console.error("Login error:", err);
      let message = 'Something went wrong. Please try again.';
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        message = 'Unable to connect to server. Please check your internet connection or try again later.';
      } else if (err instanceof Error) {
        const errMsg = err.message;
        if (errMsg === 'Failed to fetch' || errMsg.includes('Network Error')) {
          message = 'Unable to connect to server. Please check your internet connection or try again later.';
        } else if (errMsg.includes('CORS') || errMsg.includes('blocked by CORS')) {
          message = 'Connection blocked by security policy (CORS). Please contact administrator.';
        } else if (errMsg.includes('status 404') || errMsg.includes('404')) {
          message = 'Login service not found (HTTP 404). Please contact support.';
        } else if (errMsg.includes('status 500') || errMsg.includes('500')) {
          message = 'Internal server error (HTTP 500). Please try again later.';
        } else {
          message = errMsg;
        }
      }

      if (import.meta.env.DEV) {
        console.log("[Dev Log] Final API Base URL:", import.meta.env.VITE_API_BASE_URL || "http://localhost:5000");
        console.log("[Dev Log] Login Endpoint: /api/auth/login");
        if (err instanceof Error) {
          console.log("[Dev Log] Backend error message:", err.message);
        }
      }

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — decorative */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        }}
      >
        {/* Glowing blobs */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">{brandName}</span>
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Your premium<br />
            <span style={{ background: 'linear-gradient(90deg, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              shopping hub
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-xs">
            Sign in to manage orders, explore your dashboard, and get the best deals — all in one place.
          </p>

          {/* Feature list */}
          <ul className="mt-8 space-y-3">
            {['Track orders in real-time', 'Manage your store inventory', 'Personalised dashboard analytics'].map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/70 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom quote */}
        <p className="relative z-10 text-white/30 text-xs">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">{brandName.toLowerCase()}</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Welcome back</h2>
            <p className="mt-2 text-gray-500 text-sm">
              Don't have an account?{' '}
              <Link to={emailFromUrl ? `/register?email=${encodeURIComponent(emailFromUrl)}` : '/register'} className="font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                Create one for free
              </Link>
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!emailFromUrl}
                  placeholder="you@example.com"
                  className={`block w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl shadow-sm placeholder-gray-400 text-gray-900
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all ${emailFromUrl ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-12 py-3 text-sm border border-gray-200 rounded-xl bg-white shadow-sm placeholder-gray-400 text-gray-900
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="remember-me"
                  name="remember-me"
                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                />
                <span className="text-gray-600">Remember me</span>
              </label>
              <Link to="/forgot-password" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white rounded-xl
                shadow-lg shadow-violet-200 transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500
                disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: isSubmitting
                  ? '#7c3aed'
                  : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>



          <div className="mt-8 flex items-start justify-center gap-2 px-2 sm:px-0">
            <input
              type="checkbox"
              id="accept-terms"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4 cursor-pointer flex-shrink-0"
            />
            <label htmlFor="accept-terms" className="text-sm text-gray-400 cursor-pointer text-left sm:text-center">
              By signing in you agree to our{' '}
              <Link to="/terms-of-service" className="underline hover:text-gray-600 transition-colors" onClick={(e) => e.stopPropagation()}>Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy-policy" className="underline hover:text-gray-600 transition-colors" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>.
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
