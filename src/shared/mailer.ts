import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

import { log, logError } from './log';
import { inviteEmail, passwordResetEmail } from './email-templates';

let client: SESv2Client | null = null;

function getClient(region: string): SESv2Client {
  if (!client) {
    // Credentials come from the standard AWS env vars / IAM role.
    client = new SESv2Client({ region });
  }
  return client;
}

/**
 * Sends the invite signup email via AWS SES.
 *
 * When SES isn't configured (`SES_FROM_ADDRESS` / `AWS_REGION` unset) the
 * email is logged to the console instead of sent — convenient in development.
 * Throws if a configured send fails, so callers can keep the request pending.
 */
export async function sendInviteEmail(
  to: string,
  fullName: string,
  signupUrl: string,
): Promise<void> {
  const { subject, html, text } = inviteEmail({ fullName, signupUrl });
  const from = process.env.SES_FROM_ADDRESS;
  const region = process.env.AWS_REGION;

  if (!from || !region) {
    log(
      `[email:dev] SES not configured — invite email not sent.\n` +
        `  To: ${to}\n  Subject: ${subject}\n  Signup link: ${signupUrl}`,
    );
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    },
  });

  try {
    await getClient(region).send(command);
    log(`Invite email sent to ${to} via SES (${region})`);
  } catch (error) {
    logError(error, { method: 'SES', url: 'sendInviteEmail' });
    // Surface the underlying AWS reason so the admin UI can show what failed.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`SES could not send the email — ${detail}`);
  }
}

/**
 * Sends the password-reset email via AWS SES.
 *
 * Mirrors {@link sendInviteEmail}: when SES isn't configured the email is
 * logged to the console instead of sent. Errors are swallowed (logged only) so
 * the caller's response stays uniform and never reveals whether the address
 * exists.
 */
export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  resetUrl: string,
): Promise<void> {
  const { subject, html, text } = passwordResetEmail({ fullName, resetUrl });
  const from = process.env.SES_FROM_ADDRESS;
  const region = process.env.AWS_REGION;

  if (!from || !region) {
    log(
      `[email:dev] SES not configured — password reset email not sent.\n` +
        `  To: ${to}\n  Subject: ${subject}\n  Reset link: ${resetUrl}`,
    );
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    },
  });

  try {
    await getClient(region).send(command);
    log(`Password reset email sent to ${to} via SES (${region})`);
  } catch (error) {
    logError(error, { method: 'SES', url: 'sendPasswordResetEmail' });
  }
}
