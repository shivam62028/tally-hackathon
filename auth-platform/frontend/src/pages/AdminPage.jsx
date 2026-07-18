import { useState, useEffect } from 'react';
import { adminApi } from '../utils/api';

export default function AdminPage() {
  const [systemStatus, setSystemStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [status, usersData] = await Promise.all([
        adminApi.getSystemStatus(),
        adminApi.getUsers()
      ]);
      setSystemStatus(status);
      setUsers(usersData.users || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKillSwitch = async (provider, activate) => {
    setMessage({ type: '', text: '' });
    try {
      const result = activate
        ? await adminApi.activateKillSwitch(provider)
        : await adminApi.deactivateKillSwitch(provider);

      setSystemStatus(result.systemStatus);
      setMessage({
        type: 'success',
        text: `Kill switch ${activate ? 'activated' : 'deactivated'} for ${provider}`
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleHealthCheck = async () => {
    setMessage({ type: '', text: '' });
    try {
      await adminApi.healthCheck();
      await loadData();
      setMessage({ type: 'success', text: 'Health check completed' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-gray-600">System monitoring and failover controls</p>
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
          <h2 className="text-lg font-semibold">System Status</h2>
          <button onClick={handleHealthCheck} className="btn btn-secondary text-sm">
            Run Health Check
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systemStatus?.providers && Object.entries(systemStatus.providers).map(([provider, status]) => (
            <div key={provider} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium capitalize">{provider}</span>
                <div className={`w-3 h-3 rounded-full ${
                  status.healthy && !status.killSwitch ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Circuit: <span className="font-mono">{status.circuitState || 'n/a'}</span></div>
                <div>Kill Switch: {status.killSwitch ? (
                  <span className="text-red-600 font-medium">Active</span>
                ) : (
                  <span className="text-green-600">Inactive</span>
                )}</div>
              </div>
              <div className="mt-3">
                {status.killSwitch ? (
                  <button
                    onClick={() => handleKillSwitch(provider, false)}
                    className="btn btn-success text-xs w-full"
                  >
                    Deactivate Kill Switch
                  </button>
                ) : (
                  <button
                    onClick={() => handleKillSwitch(provider, true)}
                    className="btn btn-danger text-xs w-full"
                  >
                    Activate Kill Switch
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Available Auth Methods</h3>
          <div className="flex flex-wrap gap-2">
            {systemStatus?.availableMethods?.map(method => (
              <span key={method} className="badge badge-info">{method}</span>
            ))}
          </div>
          <div className="mt-2 text-sm text-blue-600">
            Fallback chain: {systemStatus?.fallbackChain?.join(' → ')}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Failover Demo</h2>
        <p className="text-gray-600 mb-4">
          Simulate provider outages to test the automatic fallback system. Activate a kill switch
          to disable a provider and watch the system automatically route to the next available method.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">Scenario 1: SMS Outage</h3>
            <p className="text-sm text-gray-600 mb-3">
              When SMS is down, the system automatically falls back to TOTP or push notifications.
            </p>
            <button
              onClick={() => handleKillSwitch('sms', !systemStatus?.providers?.sms?.killSwitch)}
              className={`btn ${systemStatus?.providers?.sms?.killSwitch ? 'btn-success' : 'btn-danger'} text-sm w-full`}
            >
              {systemStatus?.providers?.sms?.killSwitch ? 'Restore SMS' : 'Simulate SMS Outage'}
            </button>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">Scenario 2: Push Service Down</h3>
            <p className="text-sm text-gray-600 mb-3">
              When push notifications fail, users can still authenticate via TOTP or email.
            </p>
            <button
              onClick={() => handleKillSwitch('push', !systemStatus?.providers?.push?.killSwitch)}
              className={`btn ${systemStatus?.providers?.push?.killSwitch ? 'btn-success' : 'btn-danger'} text-sm w-full`}
            >
              {systemStatus?.providers?.push?.killSwitch ? 'Restore Push' : 'Simulate Push Outage'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">2FA</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Passkeys</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Devices</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Sessions</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{user.email}</td>
                  <td className="py-2 px-3">
                    {user.totpEnabled ? (
                      <span className="badge badge-success">Enabled</span>
                    ) : (
                      <span className="badge badge-warning">Disabled</span>
                    )}
                  </td>
                  <td className="py-2 px-3">{user._count.passkeys}</td>
                  <td className="py-2 px-3">{user._count.devices}</td>
                  <td className="py-2 px-3">{user._count.sessions}</td>
                  <td className="py-2 px-3 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
