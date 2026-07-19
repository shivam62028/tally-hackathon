import CircuitBreaker from 'opossum';

const PROVIDER_CONFIGS = {
  sms: {
    timeout: 5000,
    errorThreshold: 3,
    resetTimeout: 30000
  },
  push: {
    timeout: 3000,
    errorThreshold: 2,
    resetTimeout: 20000
  },
  email: {
    timeout: 10000,
    errorThreshold: 5,
    resetTimeout: 60000
  }
};

const FALLBACK_CHAIN = ['passkey', 'push', 'totp', 'sms', 'email'];

export class FailoverService {
  constructor(prisma) {
    this.prisma = prisma;
    this.circuits = new Map();
    this.providerStatus = new Map();
    this.killSwitches = new Set();

    this.initializeCircuits();
  }

  initializeCircuits() {
    for (const [provider, config] of Object.entries(PROVIDER_CONFIGS)) {
      const breaker = new CircuitBreaker(
        async (fn) => fn(),
        {
          timeout: config.timeout,
          errorThresholdPercentage: 50,
          resetTimeout: config.resetTimeout,
          volumeThreshold: config.errorThreshold
        }
      );

      breaker.on('open', () => {
        console.log(`Circuit breaker OPENED for ${provider}`);
        this.updateProviderStatus(provider, false, 'circuit_open');
      });

      breaker.on('halfOpen', () => {
        console.log(`Circuit breaker HALF-OPEN for ${provider}`);
      });

      breaker.on('close', () => {
        console.log(`Circuit breaker CLOSED for ${provider}`);
        this.updateProviderStatus(provider, true, 'recovered');
      });

      breaker.fallback(() => {
        return { success: false, reason: 'circuit_open' };
      });

      this.circuits.set(provider, breaker);
      this.providerStatus.set(provider, { healthy: true, lastCheck: new Date() });
    }
  }

  async updateProviderStatus(provider, healthy, reason) {
    this.providerStatus.set(provider, {
      healthy,
      lastCheck: new Date(),
      reason
    });

    try {
      await this.prisma.failoverStatus.upsert({
        where: { provider },
        update: {
          isHealthy: healthy,
          lastCheck: new Date(),
          failCount: healthy ? 0 : { increment: 1 }
        },
        create: {
          provider,
          isHealthy: healthy,
          lastCheck: new Date(),
          failCount: healthy ? 0 : 1
        }
      });
    } catch (err) {
      console.error('Failed to update provider status in DB:', err);
    }
  }

  activateKillSwitch(provider) {
    this.killSwitches.add(provider);
    this.updateProviderStatus(provider, false, 'kill_switch');
    console.log(`Kill switch ACTIVATED for ${provider}`);
    return { activated: true, provider };
  }

  deactivateKillSwitch(provider) {
    this.killSwitches.delete(provider);
    this.updateProviderStatus(provider, true, 'kill_switch_deactivated');
    console.log(`Kill switch DEACTIVATED for ${provider}`);
    return { deactivated: true, provider };
  }

  isProviderAvailable(provider) {
    if (this.killSwitches.has(provider)) {
      return false;
    }

    const circuit = this.circuits.get(provider);
    if (circuit && circuit.opened) {
      return false;
    }

    const status = this.providerStatus.get(provider);
    return status?.healthy ?? true;
  }

  getAvailableMethods(preferredOrder = FALLBACK_CHAIN) {
    return preferredOrder.filter(provider => this.isProviderAvailable(provider));
  }

  async executeWithFallback(primaryMethod, fallbackMethods, executeFn) {
    const allMethods = [primaryMethod, ...fallbackMethods];
    const errors = [];

    for (const method of allMethods) {
      if (!this.isProviderAvailable(method)) {
        errors.push({ method, error: 'Provider unavailable' });
        continue;
      }

      const circuit = this.circuits.get(method);

      try {
        if (circuit) {
          const result = await circuit.fire(async () => executeFn(method));
          if (result.success !== false) {
            return {
              success: true,
              method,
              result,
              failedMethods: errors
            };
          }
          errors.push({ method, error: result.reason || 'Unknown error' });
        } else {
          const result = await executeFn(method);
          if (result.success !== false) {
            return {
              success: true,
              method,
              result,
              failedMethods: errors
            };
          }
          errors.push({ method, error: result.reason || 'Unknown error' });
        }
      } catch (err) {
        errors.push({ method, error: err.message });
      }
    }

    return {
      success: false,
      errors,
      message: 'All authentication methods failed'
    };
  }

  async sendVerificationCode(userId, preferredMethod = 'push') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const sendFunctions = {
      push: async () => this.simulatePushNotification(userId, code),
      sms: async () => this.simulateSMS(userId, code),
      email: async () => this.simulateEmail(userId, code),
      totp: async () => ({ success: true, method: 'totp', message: 'Use authenticator app' })
    };

    const fallbackOrder = FALLBACK_CHAIN.filter(m => m !== preferredMethod && m !== 'passkey');

    return this.executeWithFallback(
      preferredMethod,
      fallbackOrder,
      async (method) => {
        const fn = sendFunctions[method];
        if (!fn) return { success: false, reason: 'Unknown method' };
        return fn();
      }
    );
  }

  async simulatePushNotification(userId, code) {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (Math.random() < 0.1) {
      throw new Error('Push notification service timeout');
    }

    return {
      success: true,
      method: 'push',
      message: `Push notification sent with code: ${code}`,
      numberMatch: code.substring(0, 2)
    };
  }

  async simulateSMS(userId, code) {
    await new Promise(resolve => setTimeout(resolve, 200));

    if (Math.random() < 0.1) {
      throw new Error('SMS gateway error');
    }

    return {
      success: true,
      method: 'sms',
      message: `SMS sent with code: ${code}`
    };
  }

  async simulateEmail(userId, code) {
    await new Promise(resolve => setTimeout(resolve, 300));

    if (Math.random() < 0.05) {
      throw new Error('Email service error');
    }

    return {
      success: true,
      method: 'email',
      message: `Email sent with code: ${code}`
    };
  }

  getSystemStatus() {
    const status = {};

    for (const [provider, providerStatus] of this.providerStatus) {
      const circuit = this.circuits.get(provider);

      status[provider] = {
        healthy: providerStatus.healthy,
        lastCheck: providerStatus.lastCheck,
        reason: providerStatus.reason,
        killSwitch: this.killSwitches.has(provider),
        circuitState: circuit ? (circuit.opened ? 'open' : circuit.halfOpen ? 'half-open' : 'closed') : 'n/a'
      };
    }

    status.passkey = {
      healthy: !this.killSwitches.has('passkey'),
      killSwitch: this.killSwitches.has('passkey'),
      circuitState: 'n/a'
    };

    status.totp = {
      healthy: !this.killSwitches.has('totp'),
      killSwitch: this.killSwitches.has('totp'),
      circuitState: 'n/a'
    };

    const unhealthyProviders = Object.entries(status)
      .filter(([_, s]) => !s.healthy)
      .map(([name]) => name);

    return {
      providers: status,
      availableMethods: this.getAvailableMethods(),
      fallbackChain: FALLBACK_CHAIN,
      unhealthyProviders,
      systemHealthy: unhealthyProviders.length === 0,
      timestamp: new Date().toISOString()
    };
  }

  simulateProviderFailure(provider, durationMs = 30000) {
    this.updateProviderStatus(provider, false, 'simulated_failure');

    const circuit = this.circuits.get(provider);
    if (circuit) {
      circuit.open();
    }

    setTimeout(() => {
      this.updateProviderStatus(provider, true, 'recovered_from_simulation');
      console.log(`Simulated failure ended for ${provider}`);
    }, durationMs);

    return {
      provider,
      failureSimulated: true,
      recoveryIn: `${durationMs / 1000}s`,
      currentStatus: this.getSystemStatus()
    };
  }

  getFailoverExplanation(result) {
    if (!result.failedMethods || result.failedMethods.length === 0) {
      return {
        usedMethod: result.method,
        wasFailover: false,
        message: `Request succeeded using ${result.method}`
      };
    }

    const failedNames = result.failedMethods.map(f => f.method).join(', ');
    return {
      usedMethod: result.method,
      wasFailover: true,
      failedProviders: result.failedMethods,
      message: `Primary method(s) failed (${failedNames}). Fell back to ${result.method}.`
    };
  }

  async healthCheck() {
    const results = {};

    for (const provider of Object.keys(PROVIDER_CONFIGS)) {
      try {
        const start = Date.now();
        await this.pingProvider(provider);
        const latency = Date.now() - start;

        results[provider] = {
          healthy: true,
          latency,
          timestamp: new Date().toISOString()
        };

        this.updateProviderStatus(provider, true, 'health_check_passed');
      } catch (err) {
        results[provider] = {
          healthy: false,
          error: err.message,
          timestamp: new Date().toISOString()
        };

        this.updateProviderStatus(provider, false, 'health_check_failed');
      }
    }

    return results;
  }

  async pingProvider(provider) {
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    if (this.killSwitches.has(provider)) {
      throw new Error('Kill switch active');
    }

    return true;
  }
}

let failoverServiceInstance = null;

export function getFailoverService(prisma) {
  if (!failoverServiceInstance) {
    failoverServiceInstance = new FailoverService(prisma);
  }
  return failoverServiceInstance;
}
