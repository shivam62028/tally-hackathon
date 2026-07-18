import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, authApi } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUser = useCallback(async () => {
    if (!api.accessToken) {
      setLoading(false);
      return;
    }

    try {
      const { user } = await authApi.getMe();
      setUser(user);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      api.clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    setError(null);
    try {
      const result = await authApi.login(email, password);

      if (result.requiresTOTP) {
        return { requiresTOTP: true, userId: result.userId || result.pendingToken };
      }

      api.setTokens(result.accessToken, result.refreshToken);
      await fetchUser();
      return { success: true };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const verifyTOTP = async (userId, code) => {
    setError(null);
    try {
      const result = await authApi.verifyTOTP(userId, code);
      api.setTokens(result.accessToken, result.refreshToken);
      await fetchUser();
      return { success: true };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithPasskey = async (result) => {
    api.setTokens(result.accessToken, result.refreshToken);
    await fetchUser();
    return { success: true };
  };

  const register = async (email, password) => {
    setError(null);
    try {
      await authApi.register(email, password);
      return login(email, password);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      api.clearTokens();
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const value = {
    user,
    loading,
    error,
    login,
    verifyTOTP,
    loginWithPasskey,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
