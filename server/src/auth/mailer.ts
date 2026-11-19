export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Default provider: logs instead of sending. Codes are only printed outside production. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly environment: string) {}
  async send(mail: Mail): Promise<void> {
    if (this.environment === 'production') {
      console.warn('mail: console provider in production, email not sent (set MAIL_PROVIDER=resend)');
      return;
    }
    console.log(`mail to=${mail.to} subject=${JSON.stringify(mail.subject)} text=${JSON.stringify(mail.text)}`);
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
