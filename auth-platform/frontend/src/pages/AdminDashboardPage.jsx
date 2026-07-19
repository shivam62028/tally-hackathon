import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const API_URL = 'http://localhost:3001/api';

export default function AdminDashboardPage() {
  const { token } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch(`${API_URL}/admin-portal/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.stats?.users || 0}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          color="blue"
        />
        <StatCard
          title="Active Sessions"
          value={stats?.stats?.activeSessions || 0}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
        />
        <StatCard
          title="Pending Approvals"
          value={stats?.stats?.pendingApprovals || 0}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          color="yellow"
        />
        <StatCard
          title="Risk Events"
          value={stats?.stats?.riskEvents || 0}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">System Status</h2>
          <div className="space-y-3">
            {stats?.systemStatus?.providers ? (
              Object.entries(stats.systemStatus.providers).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-gray-300 capitalize">{name}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    status.isHealthy ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
                  }`}>
                    {status.isHealthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No system status available</p>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Login Attempts</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats?.recentLogins?.length > 0 ? (
              stats.recentLogins.map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 truncate max-w-[200px]">{attempt.email}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    attempt.success ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
                  }`}>
                    {attempt.success ? 'Success' : 'Failed'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No recent login attempts</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{stats?.stats?.passkeys || 0}</p>
            <p className="text-gray-400 text-sm">Passkeys</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{stats?.stats?.totalApprovals || 0}</p>
            <p className="text-gray-400 text-sm">Total Approvals</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{stats?.stats?.activeSessions || 0}</p>
            <p className="text-gray-400 text-sm">Active Sessions</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{stats?.stats?.riskEvents || 0}</p>
            <p className="text-gray-400 text-sm">Risk Events</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-900/50 text-blue-400',
    green: 'bg-green-900/50 text-green-400',
    yellow: 'bg-yellow-900/50 text-yellow-400',
    red: 'bg-red-900/50 text-red-400'
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
