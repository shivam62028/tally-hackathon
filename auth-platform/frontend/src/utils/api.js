const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        return fetch(url, { ...options, headers });
      }
    }

    return response;
  }

  async tryRefresh() {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch (e) {
      console.error('Token refresh failed:', e);
    }

    this.clearTokens();
    return false;
  }

  async get(endpoint) {
    const response = await this.request(endpoint);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async post(endpoint, data) {
    const response = await this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }

  async delete(endpoint) {
    const response = await this.request(endpoint, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }
}

export const api = new ApiClient();

export const authApi = {
  register: (email, password) => api.post('/auth/register', { email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  verifyTOTP: (userId, code) => api.post('/auth/verify-totp', { userId, code }),
  logout: () => api.post('/auth/logout', {}),
  logoutAll: () => api.post('/auth/logout-all', {}),
  getMe: () => api.get('/auth/me'),
  setupTOTP: () => api.post('/auth/totp/setup', {}),
  enableTOTP: (code) => api.post('/auth/totp/enable', { code }),
  disableTOTP: (code) => api.post('/auth/totp/disable', { code }),
  trustDevice: (deviceId) => api.post(`/auth/devices/${deviceId}/trust`, {}),
  revokeDevice: (deviceId) => api.delete(`/auth/devices/${deviceId}`)
};

export const passkeyApi = {
  getRegistrationOptions: () => api.post('/passkey/register/options', {}),
  verifyRegistration: (response) => api.post('/passkey/register/verify', { response }),
  getAuthenticationOptions: (email) => api.post('/passkey/authenticate/options', { email }),
  verifyAuthentication: (response, email) => api.post('/passkey/authenticate/verify', { response, email }),
  list: () => api.get('/passkey/list'),
  delete: (passkeyId) => api.delete(`/passkey/${passkeyId}`)
};

export const riskApi = {
  assessLogin: (email) => api.post('/risk/assess/login', { email }),
  assessAction: (actionType, actionPayload) => api.post('/risk/assess/action', { actionType, actionPayload }),
  getHistory: (limit = 20) => api.get(`/risk/history?limit=${limit}`)
};

export const approvalApi = {
  listPolicies: () => api.get('/approval/policies'),
  getPolicy: (policyId) => api.get(`/approval/policies/${policyId}`),
  createPolicy: (data) => api.post('/approval/policies', data),
  addApprover: (policyId, userId, weight, priority) =>
    api.post(`/approval/policies/${policyId}/approvers`, { userId, weight, priority }),
  createRequest: (actionType, actionPayload) =>
    api.post('/approval/request', { actionType, actionPayload }),
  getRequest: (requestId) => api.get(`/approval/requests/${requestId}`),
  vote: (requestId, decision) => api.post(`/approval/requests/${requestId}/vote`, { decision }),
  verify: (requestId) => api.get(`/approval/requests/${requestId}/verify`),
  getPending: () => api.get('/approval/pending'),
  getMyRequests: () => api.get('/approval/my-requests')
};

export const adminApi = {
  getSystemStatus: () => api.get('/admin/system/status'),
  healthCheck: () => api.post('/admin/system/health-check', {}),
  activateKillSwitch: (provider) => api.post(`/admin/killswitch/${provider}/activate`, {}),
  deactivateKillSwitch: (provider) => api.post(`/admin/killswitch/${provider}/deactivate`, {}),
  simulateFailure: (provider, durationSeconds = 30) =>
    api.post(`/admin/simulate-failure/${provider}`, { durationSeconds }),
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users')
};

export const integrationApi = {
  createApiKey: (name, permissions, expiresInDays) =>
    api.post('/integration/api-keys', { name, permissions, expiresInDays }),
  listApiKeys: () => api.get('/integration/api-keys'),
  revokeApiKey: (keyId) => api.delete(`/integration/api-keys/${keyId}`)
};
