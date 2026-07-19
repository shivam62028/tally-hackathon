import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePasskey } from '../hooks/usePasskey';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, verifyTOTP, loginWithPasskey } = useAuth();
  const { authenticateWithPasskey, loading: passkeyLoading, error: passkeyError } = usePasskey();

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login(email, password);
      if (result.requiresTOTP) {
        setPendingUserId(result.userId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTOTPVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await verifyTOTP(pendingUserId, totpCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    try {
      const result = await authenticateWithPasskey(email || undefined);
      await loginWithPasskey(result);
    } catch (err) {
      setError(err.message);
    }
  };

  if (pendingUserId) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <div className="card w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6">Two-Factor Authentication</h2>
          <p className="text-gray-600 text-center mb-6">
            Enter the 6-digit code from your authenticator app
          </p>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleTOTPVerify}>
            <div className="mb-4">
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="input text-center text-2xl tracking-widest"
                maxLength={6}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="btn btn-primary w-full"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <button
            onClick={() => {
              setPendingUserId(null);
              setTotpCode('');
            }}
            className="btn btn-secondary w-full mt-3"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">Welcome Back</h1>
        <p className="text-gray-600 text-center mb-6">Sign in to your account</p>

        {(error || passkeyError) && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error || passkeyError}
          </div>
        )}

        <button
          onClick={handlePasskeyLogin}
          disabled={passkeyLoading}
          className="btn w-full bg-gray-900 text-white hover:bg-gray-800 mb-4"
        >
          {passkeyLoading ? 'Authenticating...' : 'Sign in with Passkey'}
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or continue with email</span>
          </div>
        </div>

        <form onSubmit={handlePasswordLogin}>
          <div className="mb-4">
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-6">
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-600 hover:text-indigo-500 font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
