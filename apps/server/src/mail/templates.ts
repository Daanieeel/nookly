/// The account's emails: a plain text body for every client and an HTML one dressed like
/// Nookly. Always light: many clients restyle or ignore dark mode, so the colours are fixed.
/// Tables and inline styles only, because mail clients strip the rest.

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const FONT = `Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;

export interface Email {
  subject: string;
  text: string;
  html: string;
}

interface Layout {
  /// Shown by the inbox next to the subject, hidden in the email.
  preview: string;
  title: string;
  /// Paragraphs above the button, already escaped.
  intro: string[];
  /// `warning` (orange) for actions that change the account, like a password reset.
  button: { label: string; url: string; severity?: "warning" };
  /// Small print under the button.
  note: string;
  publicUrl: string;
}

/// The app's own buttons (`packages/ui` `buttonVariants`), light theme: a solid fill with a
/// lit top fading out, and the shadow stack of a raised button. `warning` is the solid warning
/// variant, whose ring and shades are its fill darkened, like `--shadow-solid`.
function buttonLook(severity?: "warning") {
  if (!severity) {
    return {
      fill: "#0070f3",
      shadow:
        "0 0 0 1px rgba(0,60,140,0.55),inset 0 1px 0 0 rgba(255,255,255,0.28),inset 0 -1px 2px 0 rgba(0,10,30,0.2),0 1px 2px 0 rgba(0,10,30,0.3),0 4px 10px -3px rgba(0,10,30,0.35)",
    };
  }
  const fill = "#e5560a";
  const [r, g, b] = [0xe5, 0x56, 0x0a];
  const dark = (share: number) =>
    `${Math.round(r * share)},${Math.round(g * share)},${Math.round(b * share)}`;
  return {
    fill,
    shadow: `0 0 0 1px rgb(${dark(0.9)}),inset 0 1px 0 0 rgba(255,255,255,0.28),inset 0 -1px 2px 0 rgba(${dark(0.15)},0.4),0 1px 2px 0 rgba(${dark(0.15)},0.6),0 4px 10px -3px rgba(${dark(0.15)},0.55)`,
  };
}

function layout({ preview, title, intro, button, note, publicUrl }: Layout): string {
  const { fill, shadow } = buttonLook(button.severity);
  const url = escape(button.url);
  const paragraphs = intro
    .map((p) => `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:#52525b;">${p}</p>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fafafa;color:#0a0a0a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 20px;"><a href="${escape(publicUrl)}" style="text-decoration:none;"><img src="${escape(publicUrl)}/logo.png" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;"><span style="display:inline-block;vertical-align:middle;margin-left:10px;font:700 20px/1 ${FONT};letter-spacing:-0.02em;color:#0a0a0a;">Nookly</span></a></td></tr>
<tr><td style="padding:8px 8px 0;">
<h1 style="margin:0 0 14px;font:700 24px/1.25 ${FONT};letter-spacing:-0.025em;color:#0a0a0a;">${escape(title)}</h1>
${paragraphs}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td align="center" bgcolor="${fill}" style="border-radius:12px;background-color:${fill};"><a href="${url}" style="display:block;padding:14px 26px;font:500 15px/1 ${FONT};color:#ffffff;text-decoration:none;text-align:center;border-radius:12px;background-color:${fill};background-image:linear-gradient(to bottom,rgba(255,255,255,0.15),rgba(255,255,255,0));box-shadow:${shadow};">${escape(button.label)}</a></td></tr></table>
<p style="margin:20px 0 0;font:400 13px/1.55 ${FONT};color:#71717a;">${note}</p>
<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font:400 12px/1.55 ${FONT};color:#a1a1aa;word-break:break-all;">Button not working? Copy this link into your browser:<br><a href="${url}" style="color:#0070f3;">${url}</a></p>
</td></tr>
<tr><td align="center" style="padding:20px 0 0;font:400 12px/1.8 ${FONT};color:#a1a1aa;"><a href="https://nookly.work/imprint" style="color:#71717a;text-decoration:none;">Imprint</a> &nbsp;&nbsp; <a href="https://nookly.work/privacy" style="color:#71717a;text-decoration:none;">Privacy</a> &nbsp;&nbsp; <a href="https://nookly.work/terms" style="color:#71717a;text-decoration:none;">Terms</a><br>Nookly, your life organized in one calm place.</td></tr>
</table></td></tr></table></body></html>`;
}

export function resetPasswordEmail(publicUrl: string, token: string): Email {
  const url = `${publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reset your Nookly password",
    text: `Choose a new password here:\n\n${url}\n\nThe link works for one hour. If you didn't ask for this, ignore this email; your password stays as it is.`,
    html: layout({
      preview: "Choose a new password. The link works for one hour.",
      title: "Reset your password",
      intro: [
        "Someone asked to reset the password for your Nookly account. Choose a new one with the button below.",
      ],
      button: { label: "Choose a new password", url, severity: "warning" },
      note: "The link works for one hour. If you didn't ask for this, ignore this email. Your password stays as it is.",
      publicUrl,
    }),
  };
}

export function confirmEmailEmail(publicUrl: string, url: string): Email {
  return {
    subject: "Confirm your email for Nookly",
    text: `Confirm your email address for Nookly:\n\n${url}\n\nIf you didn't sign up, ignore this email.`,
    html: layout({
      preview: "Confirm your email address to finish setting up Nookly.",
      title: "Confirm your email",
      intro: [
        "Welcome to Nookly. Confirm your email address to finish setting up your account and to receive anything shared with you.",
      ],
      button: { label: "Confirm email", url },
      note: "If you didn't sign up for Nookly, ignore this email.",
      publicUrl,
    }),
  };
}

export function shareInviteEmail(
  publicUrl: string,
  invite: {
    owner: string;
    title: string;
    role: "editor" | "viewer";
    recipient: string;
    url: string;
  },
): Email {
  const { owner, title, role, recipient, url } = invite;
  const verb = role === "editor" ? "edit" : "view";
  return {
    subject: `${owner} shared "${title}" with you`,
    text: `${owner} shared "${title}" with you in Nookly, to ${verb}.\n\nSign in to Nookly with an account that has ${recipient} as its confirmed email to accept it, or open:\n\n${url}`,
    html: layout({
      preview: `${owner} shared "${title}" with you in Nookly.`,
      title: `${owner} shared something with you`,
      intro: [
        `<strong style="color:#0a0a0a;">${escape(owner)}</strong> shared <strong style="color:#0a0a0a;">${escape(title)}</strong> with you in Nookly, to ${verb}.`,
        `Sign in to Nookly with an account that has <strong style="color:#0a0a0a;">${escape(recipient)}</strong> as its confirmed email to accept it.`,
      ],
      button: { label: "Open invite", url },
      note: "You'll find it in Nookly under Settings, Sync, Shared with me.",
      publicUrl,
    }),
  };
}
