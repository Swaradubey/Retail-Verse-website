import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Lock, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { authApi } from '../../api/auth';

/**
 * Safe backend base URL helper.
 * Vite bakes VITE_* env vars at build time — if the variable is not set in
 * the Vercel dashboard the value becomes the literal string "undefined".
 * We guard against that here so Google OAuth never redirects to
 * /undefined/auth/google in production.
 * Uses VITE_API_BASE_URL — same env variable as apiService.ts.
 * Strip /api suffix so the Google OAuth link is built as base + /auth/google.
 */
const API_BASE_URL = (
  String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || "http://localhost:5000"
).replace(/\/api$/, "").replace(/\/$/, "");

export function Register() {
  const [searchParams] = useSearchParams();
  const urlEmail = searchParams.get('email') || '';
  const emailFromUrl = urlEmail.trim() ? urlEmail : '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const fetchCaptcha = async () => {
    try {
      const res = await authApi.getCaptcha();
      if (res.success) {
        setCaptchaId(res.data.captchaId);
        setCaptchaImage(res.data.captchaImage);
        setCaptcha('');
      }
    } catch (err) {
      console.error('Failed to fetch CAPTCHA:', err);
    }
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const validatePassword = (pass: string) => {
    if (pass.length < 8) return 'Password must be at least 8 characters long';
    if (!/[A-Z]/.test(pass)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(pass)) return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(pass)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain at least one special character';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (name.trim().length < 2) {
      setError('Full Name must be at least 2 characters long');
      return;
    }

    if (!captcha) {
      setError('Please complete the CAPTCHA');
      return;
    }

    setIsSubmitting(true);

    try {
      await register(name, email, password, confirmPassword, captcha, captchaId);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to create an account');
      fetchCaptcha(); // Refresh captcha on error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
            Create an account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Google Sign-In */}
        <a href={`${API_BASE_URL}/auth/google`} className="google-signin-btn">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
          <span>Sign in with Google</span>
        </a>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 px-3 py-2 sm:text-sm border border-gray-300 rounded-md bg-transparent"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  readOnly={!!emailFromUrl}
                  className={`focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 px-3 py-2 sm:text-sm border border-gray-300 rounded-md ${emailFromUrl ? 'bg-gray-100 cursor-not-allowed' : 'bg-transparent'}`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 pr-10 px-3 py-2 sm:text-sm border border-gray-300 rounded-md bg-transparent"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 pr-10 px-3 py-2 sm:text-sm border border-gray-300 rounded-md bg-transparent"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="captcha" className="block text-sm font-medium text-gray-700">
                CAPTCHA Verification
              </label>
              <div className="mt-2 flex items-center gap-4">
                {captchaImage ? (
                  <div className="bg-gray-100 rounded-md overflow-hidden border border-gray-200">
                    <img src={captchaImage} alt="captcha" className="h-10 w-auto" />
                  </div>
                ) : (
                  <div className="h-10 w-32 bg-gray-100 animate-pulse rounded-md" />
                )}
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                  title="Refresh CAPTCHA"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <ShieldCheck className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="captcha"
                  name="captcha"
                  type="text"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 px-3 py-2 sm:text-sm border border-gray-300 rounded-md bg-transparent"
                  placeholder="Enter characters above"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-sm ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
