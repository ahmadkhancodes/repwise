import type { Logger } from '../lib/log';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Default provider: sends nothing. Outside production it prints the message to the console so a
 * developer can sign in with `wrangler dev` (deliberately raw: local dev only, never in production).
 */
export class ConsoleMailer implements Mailer {
  constructor(
    private readonly environment: string,
    private readonly log?: Logger,
  ) {}
  async send(mail: Mail): Promise<void> {
    if (this.environment === 'production') {
      this.log?.warn('mail_not_sent', { reason: 'console provider in production (set MAIL_PROVIDER=resend)' });
      return;
    }
    console.log(`[dev mail] subject=${JSON.stringify(mail.subject)}`);
  }
}

/** Resend (https://resend.com) over plain fetch: no SDK. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  async send(mail: Mail): Promise<void> {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`mail provider status ${res.status}`);
  }
}

/** Test helper: keeps sent mail in memory. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}
