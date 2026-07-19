import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePasskey } from '../hooks/usePasskey';

const ERROR_MESSAGES = {
  'Login blocked': {
    title: 'Access Blocked',
    description: 'We detected unusual activity from your account. For your security, login has been temporarily blocked.',
    type: 'blocked'
  },
  'Login restricted': {
    title: 'Additional Verification Required',
    description: 'Your login attempt was flagged for extra security checks. Please try from a trusted device or contact support.',
    type: 'restricted'
  },
  'step_up': {
    title: 'Extra Verification Needed',
    description: 'Due to elevated risk factors, we need additional verification before granting access.',
    type: 'step_up'
  }
};

function getErrorDisplay(errorMessage) {
  for (const [key, config] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessage?.includes(key)) {
      return config;
    }
  }
  return { title: 'Error', description: errorMessage, type: 'error' };
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  const [riskReason, setRiskReason] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetSubmitted, setResetSubmitted] = useState(false);

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
        if (result.riskReason) {
          setRiskReason(result.riskReason);
        }
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

  const handlePasswordResetRequest = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason: resetReason })
      });
      const data = await res.json();
      if (res.ok) {
        setResetSubmitted(true);
        setShowResetRequest(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (pendingUserId) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <div className="card w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6">Two-Factor Authentication</h2>

          {riskReason && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg mb-4 text-sm">
              <strong>Why is this required?</strong>
              <p className="mt-1">{riskReason}</p>
            </div>
          )}

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

        {(error || passkeyError) && (() => {
          const errorDisplay = getErrorDisplay(error || passkeyError);
          const bgColor = errorDisplay.type === 'blocked' ? 'bg-red-50 border-red-200 text-red-700' :
                         errorDisplay.type === 'restricted' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                         'bg-red-50 border-red-200 text-red-600';
          return (
            <div className={`${bgColor} border p-3 rounded-lg mb-4 text-sm`}>
              <strong>{errorDisplay.title}</strong>
              <p className="mt-1">{errorDisplay.description}</p>
            </div>
          );
        })()}

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

        {resetSubmitted ? (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            Password reset request submitted! An admin will review and contact you.
          </div>
        ) : (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowResetRequest(!showResetRequest)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Forgot password? Request reset
            </button>
          </div>
        )}

        {showResetRequest && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600 mb-3">
              Enter your email above and describe why you need a reset. An admin will review your request.
            </p>
            <form onSubmit={handlePasswordResetRequest}>
              <textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="Reason for password reset (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                rows={2}
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="btn btn-secondary w-full text-sm"
              >
                {loading ? 'Submitting...' : 'Submit Reset Request'}
              </button>
            </form>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to="/admin-portal/login"
            className="block text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
