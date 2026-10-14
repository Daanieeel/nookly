# Nookly for phones

Expo (React Native) with Expo Router. Works fully offline on its own SQLite database, built from the desktop's schema; signing in to a sync server keeps it in step with your other devices.

## Run

```sh
bun install                    # from the repository root
bun run dev:mobile             # from the root: the sync server and Expo; press i for the iOS simulator
bun run dev:expo               # from the root: Expo alone, without the server
cd apps/mobile && bun run ios  # or build and run the native app (Xcode needed)
```

To sync, enter the server's address under Settings, at the bottom of the sidebar. From the iOS simulator, `http://localhost:3000` reaches a server on the same Mac; from an Android emulator use `http://10.0.2.2:3000`.

## Test

```sh
cd apps/mobile && bun run test
```

## What it shares with the desktop

| From `packages/shared`                                           |                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `schema`, `sync` (`ensureSchema`, engine, client, `SyncRuntime`) | the same database and the same sync                           |
| `data`                                                           | reads and writes that do what the desktop's Rust functions do |
| `colors`                                                         | accent colors and study statuses                              |
| `modules`                                                        | module names and entity types                                 |
| `api`                                                            | the server client                                             |

## Styles

NativeWind 5 with Tailwind 4, on the desktop's classes: the tokens are `@nookly/ui/theme.css`, the same file the desktop imports (dark by the system setting here), the primitives' classes come from `@nookly/ui/classes` and the desktop components' from `@nookly/frontend/classes`. `src/ui` rebuilds those components for React Native. `bun test ./styles.test.ts` compiles the stylesheet as the app does and checks the values.

Inter comes from `@expo-google-fonts`, one family per weight, so `font-medium` and the like pick the right face.

## Navigation

A sidebar like the desktop's (and Claude's app): Search, Dashboard, Calendar and Tasks, Pinned, each Space with its modules, Recents, then Trash and Settings. The sidebar waits behind the page, which slides aside with rounded corners and an outline (`drawerType: "back"`, `ui/inset-page.tsx`); open it with the menu button or a swipe to the right anywhere (a row with swipe actions keeps its swipe). Details open on top with a back button. `expo-router/drawer` (Reanimated) runs it.

Libraries match the desktop's: TanStack Query for data, TanStack Form with Zod for forms, Zustand for state, Tabler icons.
