import { config } from './config';

interface InviteEmailParams {
  fullName: string;
  signupUrl: string;
}

interface PasswordResetEmailParams {
  fullName: string;
  resetUrl: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = '#673de6';
const INK = '#3d3d4e';
const MUTED = '#9a9aae';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the "your invite was approved — set up your account" email.
 * HTML uses table layout + inline styles for broad email-client support;
 * the colours/wordmark mirror the Island site theme.
 */
export function inviteEmail({ fullName, signupUrl }: InviteEmailParams): RenderedEmail {
  const site = config.name;
  const name = escapeHtml(fullName);
  const url = escapeHtml(signupUrl);
  const year = new Date().getFullYear();

  const subject = `You're invited to ${site} — set up your account`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:'Poppins',Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND};padding:28px 32px;">
                <span style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(site)}&deg;</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1f1f33;">You're invited to ${escapeHtml(site)}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${name},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Your request to join <strong>${escapeHtml(site)}</strong> has been approved. Use the button below to choose a username and password and finish creating your account.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${BRAND};">
                      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Set Up Your Account</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px;">
                <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Or paste this link into your browser:</p>
                <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${url}" style="color:${BRAND};">${url}</a></p>
              </td>
            </tr>
            <tr>
              <td style="background:#f4f4f7;padding:20px 32px;border-top:1px solid #ececf1;">
                <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">&copy; ${year} ${escapeHtml(site)} &middot; island0.com<br>If you didn't request this invite, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${fullName},

Your request to join ${site} has been approved. Choose a username and password to finish creating your account:

${signupUrl}

If you didn't request this invite, you can safely ignore this email.

— ${site} (island0.com)`;

  return { subject, html, text };
}

/**
 * Builds the "reset your password" email. Same table/inline-style layout and
 * Island theme colours as the invite email; the link is short-lived.
 */
export function passwordResetEmail({ fullName, resetUrl }: PasswordResetEmailParams): RenderedEmail {
  const site = config.name;
  const name = escapeHtml(fullName);
  const url = escapeHtml(resetUrl);
  const year = new Date().getFullYear();

  const subject = `Reset your ${site} password`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:'Poppins',Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND};padding:28px 32px;">
                <span style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(site)}&deg;</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1f1f33;">Reset your password</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${name},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">We received a request to reset the password for your <strong>${escapeHtml(site)}</strong> account. Use the button below to choose a new password. This link expires in 1 hour.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:${BRAND};">
                      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Reset Password</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px;">
                <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Or paste this link into your browser:</p>
                <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${url}" style="color:${BRAND};">${url}</a></p>
              </td>
            </tr>
            <tr>
              <td style="background:#f4f4f7;padding:20px 32px;border-top:1px solid #ececf1;">
                <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">&copy; ${year} ${escapeHtml(site)} &middot; island0.com<br>If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${fullName},

We received a request to reset the password for your ${site} account. Choose a new password using the link below (it expires in 1 hour):

${resetUrl}

If you didn't request a password reset, you can safely ignore this email — your password won't change.

— ${site} (island0.com)`;

  return { subject, html, text };
}
