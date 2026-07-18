import { useState, useEffect } from 'react';
import { approvalApi } from '../utils/api';

export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedAction, setSelectedAction] = useState('');
  const [actionPayload, setActionPayload] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pending, requests, policiesData] = await Promise.all([
        approvalApi.getPending(),
        approvalApi.getMyRequests(),
        approvalApi.listPolicies()
      ]);
      setPendingApprovals(pending.requests || []);
      setMyRequests(requests.requests || []);
      setPolicies(policiesData.policies || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      let payload = {};
      try {
        payload = actionPayload ? JSON.parse(actionPayload) : {};
      } catch {
        payload = { description: actionPayload };
      }

      const result = await approvalApi.createRequest(selectedAction, payload);
      setMessage({
        type: 'success',
        text: `Approval request created. Risk score: ${result.riskAssessment?.score || 'N/A'}`
      });
      setSelectedAction('');
      setActionPayload('');
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleVote = async (requestId, decision) => {
    setMessage({ type: '', text: '' });
    try {
      const result = await approvalApi.vote(requestId, decision);
      setMessage({
        type: 'success',
        text: `Vote recorded. Status: ${result.status}`
      });
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleVerify = async (requestId) => {
    try {
      const result = await approvalApi.verify(requestId);
      setVerificationResult(result.verification);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved': return 'badge-success';
      case 'rejected': return 'badge-danger';
      case 'expired': return 'badge-warning';
      default: return 'badge-info';
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
        <h1 className="text-2xl font-bold text-gray-900">Approval Workflows</h1>
        <p className="text-gray-600">Request and approve sensitive actions</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Request Approval</h2>
        <form onSubmit={handleCreateRequest} className="space-y-4">
          <div>
            <label className="label">Action Type</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="input"
              required
            >
              <option value="">Select an action...</option>
              {policies.map(p => (
                <option key={p.id} value={p.actionType}>
                  {p.name} (requires weight: {p.requiredWeight})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Details (JSON or text)</label>
            <textarea
              value={actionPayload}
              onChange={(e) => setActionPayload(e.target.value)}
              className="input"
              rows={3}
              placeholder='{"amount": 50000, "description": "Q3 budget transfer"}'
            />
          </div>
          <button
            type="submit"
            disabled={!selectedAction}
            className="btn btn-primary"
          >
            Submit for Approval
          </button>
        </form>
      </div>

      <div className="card">
        <div className="flex gap-4 mb-4 border-b">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-2 px-1 font-medium ${
              activeTab === 'pending'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Pending Approvals ({pendingApprovals.length})
          </button>
          <button
            onClick={() => setActiveTab('my-requests')}
            className={`pb-2 px-1 font-medium ${
              activeTab === 'my-requests'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500'
            }`}
          >
            My Requests ({myRequests.length})
          </button>
        </div>

        {activeTab === 'pending' && (
          <div className="space-y-4">
            {pendingApprovals.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No pending approvals</p>
            ) : (
              pendingApprovals.map(request => (
                <div key={request.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold">{request.actionType}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        by {request.requester?.email}
                      </span>
                    </div>
                    <span className="badge badge-info">
                      {request.currentWeight}/{request.requiredWeight} weight
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    <pre className="bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(request.actionPayload, null, 2)}
                    </pre>
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    Expires: {new Date(request.expiresAt).toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVote(request.id, 'approve')}
                      className="btn btn-success"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleVote(request.id, 'reject')}
                      className="btn btn-danger"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'my-requests' && (
          <div className="space-y-4">
            {myRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No requests</p>
            ) : (
              myRequests.map(request => (
                <div key={request.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">{request.actionType}</span>
                    <span className={`badge ${getStatusBadge(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    Progress: {request.currentWeight}/{request.requiredWeight} weight
                  </div>
                  {request.votes?.length > 0 && (
                    <div className="text-sm mb-2">
                      <span className="text-gray-500">Votes: </span>
                      {request.votes.map((v, i) => (
                        <span key={i} className={`ml-1 ${
                          v.decision === 'approve' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {v.approver?.email} ({v.decision})
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mb-3">
                    Created: {new Date(request.createdAt).toLocaleString()}
                  </div>
                  <button
                    onClick={() => handleVerify(request.id)}
                    className="btn btn-secondary text-sm"
                  >
                    Verify Proof
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {verificationResult && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Verification Result</h2>
            <button
              onClick={() => setVerificationResult(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full ${
                verificationResult.isFullyVerified ? 'bg-green-500' : 'bg-red-500'
              }`}></span>
              <span className="font-medium">
                {verificationResult.isFullyVerified ? 'Fully Verified' : 'Verification Issues'}
              </span>
            </div>

            <div>
              <h3 className="font-medium mb-2">Vote Signatures</h3>
              <div className="space-y-2">
                {verificationResult.votes?.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-3 h-3 rounded-full ${
                      v.signatureValid && v.matchesRequest ? 'bg-green-500' : 'bg-red-500'
                    }`}></span>
                    <span>{v.approverEmail}</span>
                    <span className="text-gray-500">
                      {v.decision} (weight: {v.weight})
                    </span>
                    {v.signatureValid && v.matchesRequest ? (
                      <span className="text-green-600 text-xs">Valid signature</span>
                    ) : (
                      <span className="text-red-600 text-xs">Invalid</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-2">Audit Chain Integrity</h3>
              <div className="text-sm">
                {verificationResult.auditChain?.every(a => a.chainIntact) ? (
                  <span className="text-green-600">Chain intact</span>
                ) : (
                  <span className="text-red-600">Chain broken</span>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Payload Hash: {verificationResult.payloadHash}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
