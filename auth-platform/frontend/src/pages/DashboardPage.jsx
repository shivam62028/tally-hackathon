import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { riskApi, approvalApi, adminApi } from '../utils/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [riskHistory, setRiskHistory] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, riskData, approvalsData] = await Promise.all([
        adminApi.getStats().catch(() => null),
        riskApi.getHistory(5).catch(() => ({ events: [] })),
        approvalApi.getPending().catch(() => ({ requests: [] }))
      ]);

      setStats(statsData?.stats);
      setRiskHistory(riskData.events || []);
      setPendingApprovals(approvalsData.requests || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadgeClass = (score) => {
    if (score < 30) return 'badge-success';
    if (score < 60) return 'badge-warning';
    return 'badge-danger';
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user?.email}</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Total Users</div>
            <div className="text-3xl font-bold text-indigo-600">{stats.users}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Active Sessions</div>
            <div className="text-3xl font-bold text-green-600">{stats.activeSessions}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Passkeys Registered</div>
            <div className="text-3xl font-bold text-blue-600">{stats.passkeys}</div>
          </div>
          <div className="card">
            <div className="text-sm text-gray-500 mb-1">Pending Approvals</div>
            <div className="text-3xl font-bold text-orange-600">{stats.pendingApprovals}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Risk Events</h2>
          {riskHistory.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent events</p>
          ) : (
            <div className="space-y-3">
              {riskHistory.map(event => (
                <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{event.eventType}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${getRiskBadgeClass(event.riskScore)}`}>
                      Score: {event.riskScore}
                    </span>
                    <span className="badge badge-info">{event.decision}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Pending Approvals</h2>
          {pendingApprovals.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No pending approvals</p>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map(request => (
                <div key={request.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{request.actionType}</span>
                    <span className="badge badge-warning">Pending</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    From: {request.requester?.email}
                  </div>
                  <div className="text-xs text-gray-500">
                    Expires: {new Date(request.expiresAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Security Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${user?.totpEnabled ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <div>
              <div className="font-medium">Two-Factor Auth</div>
              <div className="text-sm text-gray-500">
                {user?.totpEnabled ? 'Enabled' : 'Not configured'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${user?.passkeys?.length > 0 ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <div>
              <div className="font-medium">Passkeys</div>
              <div className="text-sm text-gray-500">
                {user?.passkeys?.length || 0} registered
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${user?.devices?.some(d => d.isTrusted) ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <div>
              <div className="font-medium">Trusted Devices</div>
              <div className="text-sm text-gray-500">
                {user?.devices?.filter(d => d.isTrusted).length || 0} devices
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
