import { createContext, useContext, useState, useEffect } from 'react';

const AdminAuthContext = createContext(null);

const API_URL = 'http://localhost:3001/api';

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchAdminProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  async function fetchAdminProfile() {
    try {
      const res = await fetch(`${API_URL}/admin-portal/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdmin(data.admin);
      } else {
        logout();
      }
    } catch (err) {
      console.error('Failed to fetch admin profile:', err);
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const res = await fetch(`${API_URL}/admin-portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('adminToken', data.token);
    setToken(data.token);
    setAdmin(data.admin);
    return data;
  }

  function logout() {
    localStorage.removeItem('adminToken');
    setToken(null);
    setAdmin(null);
  }

  const value = {
    admin,
    token,
    loading,
    isAuthenticated: !!admin,
    login,
    logout
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}
