import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth, resetNavigationState } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { resolvePostLoginPath } from '../../utils/staffRoles';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Shield } from 'lucide-react';

export function SuperAdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { loginSuperAdmin, user } = useAuth();
  const { brandName } = useBranding();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'super_admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const data = await loginSuperAdmin(email, password);
      resetNavigationState();
      navigate(resolvePostLoginPath(data.role, '/'), { replace: true });
    } catch (err: unknown) {
      console.error("Login error:", err);
      let message = 'Something went wrong. Please try again.';
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        message = 'Unable to connect to server. Please try again.';
      } else if (err instanceof Error) {
        if (err.message === 'Failed to fetch' || err.message.includes('Network Error')) {
          message = 'Unable to connect to server. Please try again.';
        } else {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
        }}
      >
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">{brandName}</span>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Super Admin
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, #c4b5fd, #93c5fd)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              control plane
            </span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-xs">
            Restricted access. Sign in only with authorized Super Admin credentials.
          </p>
        </div>

        <p className="relative z-10 text-white/30 text-xs">
          © {new Date().getFullYear()} {brandName}. Super Admin access is audited.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">Super Admin</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sign in</h2>
            <p className="mt-2 text-gray-500 text-sm">
              Storefront or staff?{' '}
              <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                User login
              </Link>
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="sa-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                <input
                  id="sa-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="block w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl bg-white shadow-sm placeholder-gray-400 text-gray-900
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sa-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                <input
                  id="sa-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-12 py-3 text-sm border border-gray-200 rounded-xl bg-white shadow-sm placeholder-gray-400 text-gray-900
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white rounded-xl
                shadow-lg shadow-indigo-200 transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: isSubmitting
                  ? '#4f46e5'
                  : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in as Super Admin'
              )}
            </button>
          </form>

          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400 bg-gray-50 px-3">
              JWT · role: super_admin
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
