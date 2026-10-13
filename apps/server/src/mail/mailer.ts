import nodemailer from "nodemailer";
import type { Logger } from "../log.ts";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/// Sends the account's emails. `console` for development, `smtp` in production, and a
/// memory one in tests.
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/// Writes each email to the log, links included, so development needs no mail server.
/// Never use it in production: those links are secrets.
export class ConsoleMailer implements Mailer {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  async send(mail: Mail) {
    process.stdout.write(`\n--- email to ${mail.to}: ${mail.subject}\n${mail.text}\n---\n`);
    this.log.info("email printed (console mailer)", { to: mail.to, subject: mail.subject });
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: string;

  constructor(url: string, from: string) {
    this.transport = nodemailer.createTransport(url);
    this.from = from;
  }

  async send(mail: Mail) {
    await this.transport.sendMail({
      from: this.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail) {
    this.sent.push(mail);
  }

  /// The last link sent to `to` whose path holds `path`.
  link(to: string, path: string): string | undefined {
    const mail = [...this.sent].reverse().find((m) => m.to === to && m.text.includes(path));
    return mail?.text.match(/https?:\/\/\S+/)?.[0];
  }
}
