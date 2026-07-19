import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const API_URL = 'http://localhost:3001/api';

export default function AdminApprovalsPage() {
  const { token } = useAdminAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  async function fetchApprovals() {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? `${API_URL}/admin-portal/approvals`
        : `${API_URL}/admin-portal/approvals?status=${filter}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch approvals');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForceApprove(requestId) {
    setActionLoading(requestId);
    try {
      const res = await fetch(`${API_URL}/admin-portal/approvals/${requestId}/force-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: 'Admin override' })
      });
      if (!res.ok) throw new Error('Failed to approve');
      fetchApprovals();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleForceReject(requestId) {
    setActionLoading(requestId);
    try {
      const res = await fetch(`${API_URL}/admin-portal/approvals/${requestId}/force-reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: 'Admin rejection' })
      });
      if (!res.ok) throw new Error('Failed to reject');
      fetchApprovals();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Approval Management</h1>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-400 mt-4">No {filter === 'all' ? '' : filter} approval requests</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      {request.actionType}
                    </h3>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    Requested by: {request.requester?.email || 'Unknown'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Policy: {request.policy?.name || 'N/A'} |
                    Weight: {request.currentWeight}/{request.requiredWeight}
                  </p>

                  <div className="mt-3 p-3 bg-gray-900 rounded-lg">
                    <p className="text-gray-400 text-sm font-mono">
                      {JSON.stringify(request.actionPayload, null, 2)}
                    </p>
                  </div>

                  {request.votes?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-gray-400 text-sm font-medium mb-2">Votes:</p>
                      <div className="flex flex-wrap gap-2">
                        {request.votes.map((vote) => (
                          <span
                            key={vote.id}
                            className={`px-2 py-1 rounded text-xs ${
                              vote.decision === 'approve'
                                ? 'bg-green-900 text-green-200'
                                : 'bg-red-900 text-red-200'
                            }`}
                          >
                            {vote.approver?.email}: {vote.decision} (w:{vote.weight})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {request.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleForceApprove(request.id)}
                      disabled={actionLoading === request.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionLoading === request.id ? '...' : 'Force Approve'}
                    </button>
                    <button
                      onClick={() => handleForceReject(request.id)}
                      disabled={actionLoading === request.id}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionLoading === request.id ? '...' : 'Force Reject'}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center text-xs text-gray-500">
                <span>Created: {new Date(request.createdAt).toLocaleString()}</span>
                {request.expiresAt && (
                  <span className="ml-4">Expires: {new Date(request.expiresAt).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const classes = {
    pending: 'bg-yellow-900 text-yellow-200',
    approved: 'bg-green-900 text-green-200',
    rejected: 'bg-red-900 text-red-200',
    expired: 'bg-gray-700 text-gray-300'
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${classes[status] || classes.pending}`}>
      {status}
    </span>
  );
}
