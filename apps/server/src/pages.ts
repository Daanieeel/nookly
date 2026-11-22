/// The few pages the links in emails open. Plain HTML and CSS, dressed like
/// Nookly itself: the same colours, solid buttons, strength bar and Tabler icons, in both
/// themes. The one script (the reset page's strength bar) only adds to a page that works without.

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/// Tabler icon bodies (24 by 24, drawn with a 2px stroke).
const ICONS = {
  check: '<path d="M5 12l5 5l10 -10"/>',
  lock: '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>',
  alert:
    '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
  mail: '<path d="M11 19h-6a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v6"/><path d="M3 7l9 6l9 -6"/><path d="M15 19l2 2l4 -4"/>',
  shield:
    '<path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/>',
  invite:
    '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M16 19h6"/><path d="M19 16v6"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4"/>',
  linkOff:
    '<path d="M9 15l3 -3m2 -2l1 -1"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M3 3l18 18"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/>',
} as const;

type Icon = keyof typeof ICONS;
type Tone = "success" | "error" | "info";

/// Where the site keeps its legal pages.
const SITE = "https://nookly.work";
const LEGAL = [
  ["Imprint", "imprint"],
  ["Privacy", "privacy"],
  ["Terms", "terms"],
]
  .map(([label, path]) => `<a href="${SITE}/${path}">${label}</a>`)
  .join("");

const svg = (icon: Icon, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`;

// The tokens of packages/ui/src/theme.css, light first and dark under the system setting.
const STYLES = `
:root{color-scheme:light dark;--raised:#fff;--control:0 1px 2px 0 rgba(0,0,0,.05);--elev:0 1px 2px 0 rgba(0,0,0,.04),0 4px 8px -2px rgba(0,0,0,.06);--bg:#fafafa;--fg:#0a0a0a;--card:#fff;--muted:#666;--border:rgba(0,0,0,.09);--input:rgba(0,0,0,.14);--primary:#0070f3;--green:#00873d;--red:#dc2626;--blue:#0070f3;--field:#fff;--shadow:0 0 0 1px var(--border),0 4px 8px -2px rgba(0,0,0,.06),0 16px 32px -8px rgba(0,0,0,.14),0 40px 80px -20px rgba(0,0,0,.2);--solid:#e5560a;--solid-edge:90%;--caution:#ab7a00;--track:rgba(0,0,0,.09)}
@media (prefers-color-scheme:dark){:root{--raised:#282828;--control:inset 0 1px 0 0 rgba(255,255,255,.09),0 1px 2px 0 rgba(0,0,0,.5);--elev:inset 0 1px 0 0 rgba(255,255,255,.08),0 6px 14px -4px rgba(0,0,0,.6);--bg:#0e0e0e;--fg:#eee;--card:#1b1b1b;--muted:#a0a0a0;--border:rgba(255,255,255,.09);--input:rgba(255,255,255,.15);--green:#00cb50;--red:#ff4040;--blue:#47a8ff;--field:#282828;--shadow:0 0 0 1px var(--border),inset 0 1px 0 0 rgba(255,255,255,.07),0 16px 32px -8px rgba(0,0,0,.6),0 40px 90px -20px rgba(0,0,0,.6);--solid:#f56a14;--solid-edge:70%;--caution:#ffcc47;--track:rgba(255,255,255,.12)}}
*{box-sizing:border-box}
html{min-height:100%;background:var(--bg)}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;gap:1.5rem;padding:max(2rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));font:15px/1.55 "Inter Variable",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:var(--fg);background:var(--bg);-webkit-font-smoothing:antialiased}
.brand{display:flex;align-items:center;gap:.65rem;font:650 1.15rem/1 "Inter Tight Variable","Inter Tight",Inter,system-ui,sans-serif;letter-spacing:-.02em;color:var(--fg);text-decoration:none}
.brand img{width:36px;height:36px;border-radius:9px;display:block}
.card{width:100%;max-width:24rem;margin:auto 0;text-align:center}
.badge{position:relative;width:64px;height:64px;margin:0 auto 1.5rem}
.badge i,.badge b{position:absolute;inset:0;border-radius:14px;background:var(--raised);box-shadow:inset 0 0 0 1px var(--border),var(--control)}
.success .badge b{color:var(--green)}.error .badge b{color:var(--red)}
.badge i{opacity:.7}.badge i:nth-child(1){transform:translateX(-7px) rotate(-12deg)}.badge i:nth-child(2){transform:translateX(7px) rotate(12deg)}
.badge b{display:grid;place-items:center;color:var(--fg);box-shadow:inset 0 0 0 1px var(--border),var(--elev)}
h1{margin:0 0 .5rem;font:650 1.5rem/1.2 "Inter Tight Variable","Inter Tight",Inter,system-ui,sans-serif;letter-spacing:-.025em}
p{margin:0;color:var(--muted)}
form{margin-top:1.5rem;text-align:left}
label{display:block;margin-bottom:.4rem;font-weight:550;font-size:.875rem}
.field{position:relative}
.field svg{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
input[type=password]{width:100%;height:46px;padding:0 .9rem 0 2.55rem;border:0;border-radius:12px;background:var(--field);color:var(--fg);font:inherit;font-size:16px;box-shadow:inset 0 0 0 1px var(--input),0 1px 2px rgba(0,0,0,.05);transition:box-shadow .15s}
input[type=password]:focus{outline:0;box-shadow:inset 0 0 0 2px var(--primary)}
.field+.field{margin-top:.6rem}
[hidden]{display:none!important}
.hint{margin-top:.5rem;font-size:.8125rem}
.meter{display:flex;align-items:center;gap:.75rem;margin-top:.6rem;--m:var(--red)}
.meter[data-score="2"]{--m:var(--caution)}.meter[data-score="3"],.meter[data-score="4"]{--m:var(--green)}
.bars{display:flex;flex:1;gap:4px}
.bar{flex:1;height:4px;border-radius:99px;background:var(--track);transition:background-color .15s}
.bar.on{background:var(--m)}
.word{width:4.5rem;text-align:right;font-size:.75rem;font-weight:550;color:var(--m)}
.problem{display:flex;gap:.5rem;align-items:flex-start;margin-top:.9rem;padding:.65rem .8rem;border-radius:12px;font-size:.875rem;color:var(--red);background:color-mix(in srgb,var(--red) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--red) 22%,transparent)}
.problem svg{flex:none;margin-top:.12rem}
button{width:100%;height:46px;border:0;border-radius:12px;background-color:var(--solid);background-image:linear-gradient(to bottom,rgba(255,255,255,.15),rgba(255,255,255,0));color:#fff;font:inherit;font-weight:500;cursor:pointer;box-shadow:0 0 0 1px color-mix(in oklab,var(--solid) var(--solid-edge),black),inset 0 1px 0 0 rgba(255,255,255,.28),inset 0 -1px 2px 0 color-mix(in oklab,color-mix(in oklab,var(--solid) 15%,black) 40%,transparent),0 1px 2px 0 color-mix(in oklab,color-mix(in oklab,var(--solid) 15%,black) 60%,transparent),0 4px 10px -3px color-mix(in oklab,color-mix(in oklab,var(--solid) 15%,black) 55%,transparent);transition:filter .15s,transform .05s}
button:hover{filter:brightness(1.08)}
button:active{transform:translateY(1px);filter:brightness(.96)}
button:focus-visible{outline:2px solid var(--solid);outline-offset:3px}
.actions{margin-top:1.5rem}
.note{margin-top:1.25rem;font-size:.8125rem}
.foot{display:flex;flex-direction:column;align-items:center;gap:.6rem;font-size:.8125rem;color:var(--muted)}
.legal{display:flex;flex-wrap:wrap;justify-content:center;gap:.25rem 1.25rem}
.legal a{color:var(--muted);text-decoration:none;padding:.25rem 0}
.legal a:hover{color:var(--fg);text-decoration:underline}
@media (max-width:30rem){body{gap:1.25rem;padding-top:max(2.5rem,env(safe-area-inset-top))}.card{max-width:none}h1{font-size:1.35rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`.replaceAll(/\n/g, "");

function page(title: string, tone: Tone, icon: Icon, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escape(title)} · Nookly</title><link rel="icon" href="/logo.png"><style>${STYLES}</style>${head}</head><body><a class="brand" href="/" tabindex="-1"><img src="/logo.png" alt="" width="36" height="36">Nookly</a><main class="card ${tone}"><div class="badge" aria-hidden="true"><i></i><i></i><b>${svg(icon, 26)}</b></div><h1>${escape(title)}</h1>${body}</main><footer class="foot"><nav class="legal" aria-label="Legal">${LEGAL}</nav><span>Your life, organized in one calm place.</span></footer></body></html>`;
}

export function resultPage(
  title: string,
  message: string,
  tone: Tone = "success",
  icon: Icon = tone === "error" ? "linkOff" : "check",
): string {
  return page(title, tone, icon, `<p>${escape(message)}</p>`);
}

export function emailConfirmedPage(): string {
  return page(
    "Email confirmed",
    "success",
    "mail",
    '<p>Thanks, your address is confirmed.</p><p class="note">You can close this tab and go back to Nookly.</p>',
  );
}

export function passwordChangedPage(): string {
  return page(
    "Password changed",
    "success",
    "shield",
    '<p>Sign in to Nookly with your new password. Every device was signed out.</p><p class="note">You can close this tab and go back to Nookly.</p>',
  );
}

export function resetPasswordPage(token: string, error?: string): string {
  return page(
    "Choose a new password",
    "info",
    "lock",
    `<p>Pick something you don't use anywhere else. Your devices are signed out once you save it.</p>
<form method="post" action="/reset-password"><input type="hidden" name="token" value="${escape(token)}">
<label for="password">New password</label>
<div class="field">${svg("lock", 18)}<input id="password" name="password" type="password" minlength="10" required autofocus autocomplete="new-password" placeholder="At least 10 characters"></div>
<div class="field">${svg("lock", 18)}<input id="repeat" name="confirm" type="password" minlength="10" required autocomplete="new-password" placeholder="Repeat password" aria-label="Repeat new password"></div>
<div id="meter" class="meter" role="meter" aria-label="Password strength" aria-valuemin="0" aria-valuemax="4" hidden><div class="bars" aria-hidden="true"><span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span></div><span id="meter-word" class="word" aria-hidden="true"></span></div>
<div id="problem" class="problem" role="alert"${error ? "" : " hidden"}>${svg("alert", 18)}<span>${error ? escape(error) : ""}</span></div>
<p id="hint" class="hint"${error ? " hidden" : ""}>Use at least 10 characters.</p>
<div class="actions"><button type="submit">Save password</button></div></form>`,
    '<script src="/reset-password.js" defer></script>',
  );
}

export function invitePage(): string {
  return page(
    "You were invited to Nookly",
    "info",
    "invite",
    "<p>Open Nookly and sign in with the address this invite was sent to. You'll find it under Settings, Sync, Shared with me, ready to accept.</p>",
  );
}

let script: Promise<string | null> | null = null;

/// The reset page's script, bundled from `client/reset-password.ts` on first use and kept.
/// Null if it can't be built: the page then works without the strength bar.
export function resetPasswordScript(): Promise<string | null> {
  script ??= Bun.build({
    entrypoints: [new URL("./client/reset-password.ts", import.meta.url).pathname],
    target: "browser",
    minify: true,
  })
    .then((result) => (result.success ? result.outputs[0].text() : null))
    .catch(() => null);
  return script;
}
