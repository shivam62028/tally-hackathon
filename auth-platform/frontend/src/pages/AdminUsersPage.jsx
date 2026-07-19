import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const API_URL = 'http://localhost:3001/api';

export default function AdminUsersPage() {
  const { token } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [resetModal, setResetModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch(`${API_URL}/admin-portal/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch(`${API_URL}/admin-portal/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) throw new Error('Failed to update role');
      fetchUsers();
      setEditingUser(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResetPassword(userId) {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin-portal/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setSuccess(`Password reset successfully for ${data.email}. Account unlocked.`);
      setResetModal(null);
      setNewPassword('');
      setTimeout(() => setSuccess(''), 5000);
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
      <h1 className="text-2xl font-bold text-white">User Management</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg flex justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400">&times;</button>
        </div>
      )}

      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg flex justify-between">
          {success}
          <button onClick={() => setSuccess('')} className="text-green-400">&times;</button>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">User</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Security</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Activity</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-750">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-white font-medium">{user.email}</p>
                    <p className="text-gray-500 text-xs">{user.id}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {editingUser === user.id ? (
                    <select
                      className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-sm"
                      defaultValue={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      onBlur={() => setEditingUser(null)}
                      autoFocus
                    >
                      <option value="user">User</option>
                      <option value="approver">Approver</option>
                      <option value="manager">Manager</option>
                    </select>
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      user.role === 'manager' ? 'bg-purple-900 text-purple-200' :
                      user.role === 'approver' ? 'bg-blue-900 text-blue-200' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {user.role}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {user.totpEnabled && (
                      <span className="px-2 py-1 bg-green-900 text-green-200 rounded text-xs">
                        2FA
                      </span>
                    )}
                    {user._count?.passkeys > 0 && (
                      <span className="px-2 py-1 bg-indigo-900 text-indigo-200 rounded text-xs">
                        {user._count.passkeys} Passkey{user._count.passkeys > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  <div className="space-y-1">
                    <p>{user._count?.devices || 0} devices</p>
                    <p>{user._count?.sessions || 0} sessions</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingUser(user.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                    >
                      Edit Role
                    </button>
                    <button
                      onClick={() => setResetModal(user)}
                      className="text-yellow-400 hover:text-yellow-300 text-sm font-medium"
                    >
                      Reset Password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No users found</p>
          </div>
        )}
      </div>

      {resetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Reset Password</h3>
            <p className="text-gray-400 mb-4">
              Reset password for: <strong className="text-white">{resetModal.email}</strong>
            </p>
            <p className="text-yellow-400 text-sm mb-4">
              This will also unlock the account if it's locked.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => handleResetPassword(resetModal.id)}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-medium"
              >
                Reset Password
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
