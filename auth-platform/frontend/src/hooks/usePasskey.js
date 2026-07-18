import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { passkeyApi } from '../utils/api';

export function usePasskey() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const registerPasskey = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const options = await passkeyApi.getRegistrationOptions();
      const credential = await startRegistration(options);
      const result = await passkeyApi.verifyRegistration(credential);
      return result;
    } catch (err) {
      const message = err.name === 'NotAllowedError'
        ? 'Passkey registration was cancelled'
        : err.message || 'Failed to register passkey';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const authenticateWithPasskey = useCallback(async (email) => {
    setLoading(true);
    setError(null);

    try {
      const options = await passkeyApi.getAuthenticationOptions(email);
      const credential = await startAuthentication(options);
      const result = await passkeyApi.verifyAuthentication(credential, email);
      return result;
    } catch (err) {
      const message = err.name === 'NotAllowedError'
        ? 'Passkey authentication was cancelled'
        : err.message || 'Failed to authenticate with passkey';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    registerPasskey,
    authenticateWithPasskey,
    loading,
    error,
    clearError
  };
}
