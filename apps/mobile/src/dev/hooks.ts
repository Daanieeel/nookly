/// Actions a script of `tools/e2e/mobile.ts` can call by name (`hooks.openSidebar()`), for
/// what sits outside the React tree the scripts walk, like the native bar's buttons. The
/// app registers them; nothing calls them outside end to end checks.
export const devHooks: Record<string, () => void> = {};
