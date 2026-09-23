# Local Storage Keys

All keys are defined in [`src/lib/storage-keys.ts`](../../src/lib/storage-keys.ts).

| Key | Value | Default | Owner |
| --- | --- | --- | --- |
| `nookly:sidebar-collapsed` | `"1"` collapsed, `"0"` expanded | expanded | [`src/lib/store/nav.ts`](../../src/lib/store/nav.ts) |
| `nookly:right-sidebar-collapsed` | `"1"` collapsed, `"0"` expanded | expanded | [`src/lib/store/nav.ts`](../../src/lib/store/nav.ts) |
| `nookly:right-sidebar-width` | width in pixels, clamped to 184 to 480 | `288` | [`src/lib/store/nav.ts`](../../src/lib/store/nav.ts) |
| `nookly:active-space` | id of the last active Space, removed when none | none | [`src/lib/store/nav.ts`](../../src/lib/store/nav.ts) |
| `nookly:recents` | JSON array of `{ entityId, spaceId, openedAt }`, max 5 | `[]` | [`src/lib/store/nav.ts`](../../src/lib/store/nav.ts) |
| `nookly:cli-install-card-dismissed` | `"1"` once dismissed | shown | [`src/components/sidebar/cli-install-card.tsx`](../../src/components/sidebar/cli-install-card.tsx) |
| `nookly:theme` | `"light"`, `"dark"` or `"system"` | `"system"` | [`src/lib/theme.ts`](../../src/lib/theme.ts) |
