import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const API_URL = 'http://localhost:3001/api';

export default function AdminNotificationsPage() {
  const { token } = useAdminAuth();
  const [notifications, setNotifications] = useState([]);
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('notifications');
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [notifRes, resetRes] = await Promise.all([
        fetch(`${API_URL}/admin-portal/notifications`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin-portal/password-reset-requests`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!notifRes.ok || !resetRes.ok) throw new Error('Failed to fetch data');

      const notifData = await notifRes.json();
      const resetData = await resetRes.json();

      setNotifications(notifData.notifications || []);
      setPasswordRequests(resetData.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id) {
    try {
      await fetch(`${API_URL}/admin-portal/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resolveNotification(id) {
    try {
      await fetch(`${API_URL}/admin-portal/notifications/${id}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAllRead() {
    try {
      await fetch(`${API_URL}/admin-portal/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function unlockAccount(email) {
    try {
      await fetch(`${API_URL}/admin-portal/account-locks/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function approvePasswordReset(id) {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin-portal/password-reset-requests/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword, adminNotes: 'Password reset approved' })
      });

      if (!res.ok) throw new Error('Failed to approve');
      setResetModal(null);
      setNewPassword('');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function rejectPasswordReset(id) {
    try {
      await fetch(`${API_URL}/admin-portal/password-reset-requests/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ adminNotes: 'Request rejected' })
      });
      fetchData();
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

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const pendingResets = passwordRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Notifications & Requests</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            Mark All Read
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400">&times;</button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'notifications'
              ? 'text-red-400 border-b-2 border-red-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Notifications
          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('password-resets')}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'password-resets'
              ? 'text-red-400 border-b-2 border-red-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Password Resets
          {pendingResets > 0 && (
            <span className="bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-full">{pendingResets}</span>
          )}
        </button>
      </div>

      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
              <p className="text-gray-400">No notifications</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`bg-gray-800 rounded-xl p-6 border ${
                  !notif.isRead ? 'border-red-600' : 'border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <NotificationIcon type={notif.type} />
                      <h3 className="text-lg font-semibold text-white">{notif.title}</h3>
                      {!notif.isRead && (
                        <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded">NEW</span>
                      )}
                      {notif.isResolved && (
                        <span className="bg-green-900 text-green-200 text-xs px-2 py-0.5 rounded">RESOLVED</span>
                      )}
                    </div>
                    <p className="text-gray-300 mt-2">{notif.message}</p>
                    {notif.email && (
                      <p className="text-gray-500 text-sm mt-1">Email: {notif.email}</p>
                    )}
                    {notif.ipAddress && (
                      <p className="text-gray-500 text-sm">IP: {notif.ipAddress}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-2">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2 ml-4">
                    {!notif.isRead && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                      >
                        Mark Read
                      </button>
                    )}
                    {notif.type === 'account_locked' && !notif.isResolved && notif.email && (
                      <button
                        onClick={() => unlockAccount(notif.email)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                      >
                        Unlock Account
                      </button>
                    )}
                    {!notif.isResolved && (
                      <button
                        onClick={() => resolveNotification(notif.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'password-resets' && (
        <div className="space-y-4">
          {passwordRequests.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
              <p className="text-gray-400">No password reset requests</p>
            </div>
          ) : (
            passwordRequests.map((req) => (
              <div key={req.id} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{req.email}</h3>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      Reason: {req.reason || 'Not provided'}
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      Requested: {new Date(req.createdAt).toLocaleString()}
                    </p>
                    {req.processedAt && (
                      <p className="text-gray-600 text-xs">
                        Processed: {new Date(req.processedAt).toLocaleString()} by {req.processedBy}
                      </p>
                    )}
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setResetModal(req)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                      >
                        Set New Password
                      </button>
                      <button
                        onClick={() => rejectPasswordReset(req.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {resetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Set New Password</h3>
            <p className="text-gray-400 mb-4">
              Setting new password for: <strong>{resetModal.email}</strong>
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => approvePasswordReset(resetModal.id)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg"
              >
                Approve & Set Password
              </button>
              <button
                onClick={() => { setResetModal(null); setNewPassword(''); }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationIcon({ type }) {
  const iconClass = "w-6 h-6";

  if (type === 'account_locked') {
    return (
      <div className="p-2 bg-red-900 rounded-lg">
        <svg className={`${iconClass} text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
    );
  }

  if (type === 'suspicious_login') {
    return (
      <div className="p-2 bg-yellow-900 rounded-lg">
        <svg className={`${iconClass} text-yellow-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    );
  }

  if (type === 'password_reset_request') {
    return (
      <div className="p-2 bg-blue-900 rounded-lg">
        <svg className={`${iconClass} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="p-2 bg-gray-700 rounded-lg">
      <svg className={`${iconClass} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </div>
  );
}

function StatusBadge({ status }) {
  const classes = {
    pending: 'bg-yellow-900 text-yellow-200',
    approved: 'bg-green-900 text-green-200',
    rejected: 'bg-red-900 text-red-200'
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${classes[status] || classes.pending}`}>
      {status}
    </span>
  );
}
