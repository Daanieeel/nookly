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

| From `packages/shared`                                           |                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `schema`, `sync` (`ensureSchema`, engine, client, `SyncRuntime`) | the same database and the same sync                                        |
| `data`                                                           | reads and writes that do what the desktop's Rust functions do              |
| `tokens`, `colors`                                               | the desktop's colors, radius, type scale, accent colors and study statuses |
| `modules`                                                        | module names and entity types                                              |
| `api`                                                            | the server client                                                          |

## Navigation

A sidebar like the desktop's (and Claude's app): Search, Dashboard, Calendar and Tasks, Pinned, each Space with its modules, Recents, then Trash and Settings. It slides the page aside; open it with the menu button or a swipe to the right anywhere (a row with swipe actions keeps its swipe). Details open on top with a back button. `expo-router/drawer` (Reanimated) runs it.

Libraries match the desktop's: TanStack Query for data, TanStack Form with Zod for forms, Zustand for state, Tabler icons.
