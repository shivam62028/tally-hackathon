import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'security@authplatform.com';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('SendGrid configured for real email delivery');
} else {
  console.log('SendGrid API key not set - emails will be logged to console');
}

export class NotificationService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async sendEmail(to, subject, body, html = null) {
    if (!SENDGRID_API_KEY) {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`[EMAIL SIMULATION]`);
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${body}`);
      console.log('═══════════════════════════════════════════════════════');

      return {
        sent: true,
        simulated: true,
        to,
        subject,
        timestamp: new Date().toISOString()
      };
    }

    try {
      const msg = {
        to,
        from: FROM_EMAIL,
        subject,
        text: body,
        html: html || body.replace(/\n/g, '<br>')
      };

      await sgMail.send(msg);
      console.log(`[EMAIL SENT] To: ${to}, Subject: ${subject}`);

      return {
        sent: true,
        simulated: false,
        to,
        subject,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[EMAIL ERROR]', error.message);
      return {
        sent: false,
        error: error.message,
        to,
        subject
      };
    }
  }

  async sendLoginAttemptWarning(userEmail, attemptCount, maxAttempts, ipAddress, userAgent) {
    const remainingAttempts = maxAttempts - attemptCount;
    const subject = `Security Alert: Failed Login Attempts on Your Account`;

    const body = `
Hello,

We detected ${attemptCount} failed login attempt(s) on your account.

Details:
- IP Address: ${ipAddress || 'Unknown'}
- Device: ${userAgent || 'Unknown'}
- Time: ${new Date().toLocaleString()}
- Remaining attempts: ${remainingAttempts}

If this was you, please ensure you're using the correct password.
If this wasn't you, we recommend:
1. Change your password immediately
2. Enable two-factor authentication
3. Review your recent account activity

${remainingAttempts <= 2 ? `WARNING: Your account will be temporarily locked after ${remainingAttempts} more failed attempt(s).` : ''}

If you need assistance, please contact support.

- Auth Platform Security Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9fafb; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 15px; margin: 15px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Security Alert</h2>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>We detected <strong>${attemptCount} failed login attempt(s)</strong> on your account.</p>

      <div class="details">
        <strong>Details:</strong><br>
        IP Address: ${ipAddress || 'Unknown'}<br>
        Device: ${userAgent || 'Unknown'}<br>
        Time: ${new Date().toLocaleString()}<br>
        Remaining attempts: ${remainingAttempts}
      </div>

      ${remainingAttempts <= 2 ? `<div class="warning"><strong>WARNING:</strong> Your account will be temporarily locked after ${remainingAttempts} more failed attempt(s).</div>` : ''}

      <p>If this was you, please ensure you're using the correct password.</p>
      <p>If this wasn't you, we recommend:</p>
      <ol>
        <li>Change your password immediately</li>
        <li>Enable two-factor authentication</li>
        <li>Review your recent account activity</li>
      </ol>
    </div>
    <div class="footer">
      Auth Platform Security Team
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail(userEmail, subject, body, html);
  }

  async sendAccountLockedNotification(userEmail, ipAddress, userAgent, lockDurationMinutes) {
    const subject = `Security Alert: Your Account Has Been Temporarily Locked`;

    const body = `
Hello,

Your account has been temporarily locked due to multiple failed login attempts.

Details:
- IP Address: ${ipAddress || 'Unknown'}
- Device: ${userAgent || 'Unknown'}
- Time: ${new Date().toLocaleString()}
- Lock Duration: ${lockDurationMinutes} minutes

This is a security measure to protect your account from unauthorized access.

What to do:
1. Wait ${lockDurationMinutes} minutes before trying again
2. Ensure you're using the correct credentials
3. Consider resetting your password if you've forgotten it
4. Enable two-factor authentication for added security

If you did not attempt to log in, your account may be under attack.
Please change your password immediately once the lock expires.

- Auth Platform Security Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9fafb; }
    .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .locked { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }
    .steps { background: white; padding: 15px; border-radius: 8px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Account Locked</h2>
    </div>
    <div class="content">
      <p>Hello,</p>

      <div class="locked">
        <strong>Your account has been temporarily locked</strong> due to multiple failed login attempts.
      </div>

      <div class="details">
        <strong>Details:</strong><br>
        IP Address: ${ipAddress || 'Unknown'}<br>
        Device: ${userAgent || 'Unknown'}<br>
        Time: ${new Date().toLocaleString()}<br>
        Lock Duration: <strong>${lockDurationMinutes} minutes</strong>
      </div>

      <div class="steps">
        <strong>What to do:</strong>
        <ol>
          <li>Wait ${lockDurationMinutes} minutes before trying again</li>
          <li>Ensure you're using the correct credentials</li>
          <li>Consider resetting your password if you've forgotten it</li>
          <li>Enable two-factor authentication for added security</li>
        </ol>
      </div>

      <p><em>If you did not attempt to log in, your account may be under attack. Please change your password immediately once the lock expires.</em></p>
    </div>
    <div class="footer">
      Auth Platform Security Team
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail(userEmail, subject, body, html);
  }
}
