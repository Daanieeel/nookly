/// The few pages the links in emails open. Plain HTML, no scripts.

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Nookly</title><style>
body{font:15px/1.5 system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#18181b;background:#fafafa}
@media (prefers-color-scheme:dark){body{color:#fafafa;background:#18181b}input{background:#27272a;color:#fafafa;border-color:#3f3f46}}
h1{font-size:1.25rem}input{width:100%;box-sizing:border-box;padding:.5rem;border:1px solid #d4d4d8;border-radius:.5rem;font:inherit}
button{margin-top:.75rem;padding:.5rem 1rem;border:0;border-radius:.5rem;background:#18181b;color:#fff;font:inherit}.error{color:#dc2626}
</style></head><body><h1>${escape(title)}</h1>${body}</body></html>`;
}

export function resultPage(title: string, message: string): string {
  return page(title, `<p>${escape(message)}</p>`);
}

export function resetPasswordPage(token: string, error?: string): string {
  return page(
    "Choose a new password",
    `<form method="post" action="/reset-password"><input type="hidden" name="token" value="${escape(token)}">
<label for="password">New password</label><input id="password" name="password" type="password" minlength="10" required autocomplete="new-password">
${error ? `<p class="error">${escape(error)}</p>` : ""}<button type="submit">Save password</button></form>`,
  );
}

export function invitePage(): string {
  return page(
    "You were invited to Nookly",
    "<p>Open Nookly and sign in with the address this invite was sent to. You'll find it under Settings, Sync, Shared with me, ready to accept.</p>",
  );
}
