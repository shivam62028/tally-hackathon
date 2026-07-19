import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const API_URL = 'http://localhost:3001/api';

export default function AdminSecurityPage() {
  const { token } = useAdminAuth();
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [locks, setLocks] = useState([]);
  const [riskEvents, setRiskEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('attempts');

  useEffect(() => {
    fetchSecurityData();
  }, []);

  async function fetchSecurityData() {
    try {
      const [attemptsRes, riskRes] = await Promise.all([
        fetch(`${API_URL}/admin-portal/login-attempts`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin-portal/risk-events`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!attemptsRes.ok || !riskRes.ok) throw new Error('Failed to fetch security data');

      const attemptsData = await attemptsRes.json();
      const riskData = await riskRes.json();

      setLoginAttempts(attemptsData.attempts || []);
      setLocks(attemptsData.locks || []);
      setRiskEvents(riskData.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(email) {
    try {
      const res = await fetch(`${API_URL}/admin-portal/account-locks/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to unlock account');
      fetchSecurityData();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Security Monitor</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {locks.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-200 mb-4">
            Locked Accounts ({locks.length})
          </h2>
          <div className="space-y-3">
            {locks.map((lock) => (
              <div key={lock.id} className="flex items-center justify-between bg-red-900/50 rounded-lg p-4">
                <div>
                  <p className="text-white font-medium">{lock.email}</p>
                  <p className="text-red-300 text-sm">
                    Locked until: {new Date(lock.lockedUntil).toLocaleString()}
                  </p>
                  <p className="text-red-400 text-xs">{lock.reason}</p>
                </div>
                <button
                  onClick={() => handleUnlock(lock.email)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                >
                  Unlock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('attempts')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'attempts'
              ? 'text-red-400 border-b-2 border-red-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Login Attempts
        </button>
        <button
          onClick={() => setActiveTab('risk')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'risk'
              ? 'text-red-400 border-b-2 border-red-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Risk Events
        </button>
      </div>

      {activeTab === 'attempts' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">IP Address</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loginAttempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-6 py-4 text-white">{attempt.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      attempt.success
                        ? 'bg-green-900 text-green-200'
                        : 'bg-red-900 text-red-200'
                    }`}>
                      {attempt.success ? 'Success' : 'Failed'}
                    </span>
                    {attempt.failReason && (
                      <span className="ml-2 text-gray-500 text-xs">{attempt.failReason}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm">{attempt.ipAddress || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-400 text-sm">
                    {new Date(attempt.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loginAttempts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">No login attempts recorded</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="space-y-4">
          {riskEvents.length === 0 ? (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
              <p className="text-gray-400">No risk events recorded</p>
            </div>
          ) : (
            riskEvents.map((event) => (
              <div key={event.id} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{event.eventType}</h3>
                      <RiskScoreBadge score={event.riskScore} />
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        event.decision === 'allow' ? 'bg-green-900 text-green-200' :
                        event.decision === 'block' ? 'bg-red-900 text-red-200' :
                        'bg-yellow-900 text-yellow-200'
                      }`}>
                        {event.decision}
                      </span>
                    </div>
                    {event.user && (
                      <p className="text-gray-400 text-sm mt-1">User: {event.user.email}</p>
                    )}
                    {event.explanation && (
                      <p className="text-gray-500 text-sm mt-2">{event.explanation}</p>
                    )}
                  </div>
                  <span className="text-gray-500 text-sm">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">IP Address</p>
                    <p className="text-gray-300">{event.ipAddress || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">User Agent</p>
                    <p className="text-gray-300 truncate max-w-[200px]">{event.userAgent || 'N/A'}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RiskScoreBadge({ score }) {
  let colorClass = 'bg-green-900 text-green-200';
  if (score >= 70) {
    colorClass = 'bg-red-900 text-red-200';
  } else if (score >= 40) {
    colorClass = 'bg-yellow-900 text-yellow-200';
  }

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      Risk: {score}
    </span>
  );
}
