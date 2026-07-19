import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePasskey } from '../hooks/usePasskey';
import { authApi, passkeyApi } from '../utils/api';

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  const { registerPasskey, loading: passkeyLoading } = usePasskey();

  const [passkeys, setPasskeys] = useState([]);
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    try {
      const { passkeys } = await passkeyApi.list();
      setPasskeys(passkeys);
    } catch (err) {
      console.error('Failed to load passkeys:', err);
    }
  };

  const handleRegisterPasskey = async () => {
    setMessage({ type: '', text: '' });
    try {
      await registerPasskey();
      setMessage({ type: 'success', text: 'Passkey registered successfully!' });
      loadPasskeys();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeletePasskey = async (passkeyId) => {
    if (!confirm('Are you sure you want to delete this passkey?')) return;

    try {
      await passkeyApi.delete(passkeyId);
      setMessage({ type: 'success', text: 'Passkey deleted' });
      loadPasskeys();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleSetupTOTP = async () => {
    setLoading(true);
    try {
      const setup = await authApi.setupTOTP();
      setTotpSetup(setup);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.enableTOTP(totpCode);
      setMessage({ type: 'success', text: 'Two-factor authentication enabled!' });
      setTotpSetup(null);
      setTotpCode('');
      refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.disableTOTP(disableCode);
      setMessage({ type: 'success', text: 'Two-factor authentication disabled' });
      setShowDisable(false);
      setDisableCode('');
      refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTrustDevice = async (deviceId) => {
    try {
      await authApi.trustDevice(deviceId);
      setMessage({ type: 'success', text: 'Device marked as trusted' });
      refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    if (!confirm('This will log out all sessions on this device. Continue?')) return;

    try {
      await authApi.revokeDevice(deviceId);
      setMessage({ type: 'success', text: 'Device revoked' });
      refreshUser();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="text-gray-600">Manage your authentication methods and devices</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Passkeys</h2>
            <p className="text-sm text-gray-500">Passwordless authentication using biometrics or security keys</p>
          </div>
          <button
            onClick={handleRegisterPasskey}
            disabled={passkeyLoading}
            className="btn btn-primary"
          >
            {passkeyLoading ? 'Registering...' : '+ Add Passkey'}
          </button>
        </div>

        {passkeys.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No passkeys registered</p>
            <p className="text-sm">Add a passkey for fast, secure passwordless login</p>
          </div>
        ) : (
          <div className="space-y-3">
            {passkeys.map(pk => (
              <div key={pk.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">
                    {pk.deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device Passkey'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                    {pk.lastUsed && ` · Last used ${new Date(pk.lastUsed).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pk.backedUp && <span className="badge badge-success">Backed up</span>}
                  <button
                    onClick={() => handleDeletePasskey(pk.id)}
                    className="btn btn-danger text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
            <p className="text-sm text-gray-500">Add an extra layer of security with TOTP</p>
          </div>
          {user?.totpEnabled ? (
            <span className="badge badge-success">Enabled</span>
          ) : (
            <span className="badge badge-warning">Disabled</span>
          )}
        </div>

        {user?.totpEnabled ? (
          <div>
            {showDisable ? (
              <form onSubmit={handleDisableTOTP} className="space-y-4">
                <p className="text-sm text-gray-600">Enter your TOTP code to disable 2FA:</p>
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="input max-w-xs"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className="btn btn-danger">
                    {loading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDisable(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowDisable(true)}
                className="btn btn-secondary"
              >
                Disable 2FA
              </button>
            )}
          </div>
        ) : totpSetup ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <img src={totpSetup.qrCode} alt="TOTP QR Code" className="w-48 h-48" />
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Or enter this code manually:</p>
                <code className="px-3 py-1 bg-gray-200 rounded text-sm font-mono">
                  {totpSetup.secret}
                </code>
              </div>
            </div>
            <form onSubmit={handleEnableTOTP} className="space-y-4">
              <div>
                <label className="label">Enter the code from your authenticator app:</label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="input max-w-xs"
                  maxLength={6}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="btn btn-primary"
                >
                  {loading ? 'Enabling...' : 'Enable 2FA'}
                </button>
                <button
                  type="button"
                  onClick={() => setTotpSetup(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={handleSetupTOTP}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Setting up...' : 'Set Up 2FA'}
          </button>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Devices</h2>
        {user?.devices?.length === 0 ? (
          <p className="text-gray-500">No devices registered</p>
        ) : (
          <div className="space-y-3">
            {user?.devices?.map(device => (
              <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {device.userAgent?.includes('Mobile') ? 'Mobile Device' : 'Desktop'}
                    {device.isTrusted && <span className="badge badge-success">Trusted</span>}
                  </div>
                  <div className="text-sm text-gray-500">
                    Last seen {new Date(device.lastSeen).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!device.isTrusted && (
                    <button
                      onClick={() => handleTrustDevice(device.id)}
                      className="btn btn-secondary text-sm"
                    >
                      Trust
                    </button>
                  )}
                  <button
                    onClick={() => handleRevokeDevice(device.id)}
                    className="btn btn-danger text-sm"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
