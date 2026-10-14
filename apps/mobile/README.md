# Nookly for phones

Expo (React Native) with Expo Router. Works fully offline on its own SQLite database, built from the desktop's schema; signing in to a sync server keeps it in step with your other devices.

## Run

```sh
bun install                    # from the repository root
cd apps/mobile
bun run start                  # Expo dev server; press i for the iOS simulator, a for Android
bun run ios                    # or build and run the native app (Xcode needed)
```

To sync, start the server (`apps/server`, see its README) and enter its address under Settings (the gear on the Dashboard). From the iOS simulator, `http://localhost:3000` reaches a server on the same Mac; from an Android emulator use `http://10.0.2.2:3000`.

## Test

```sh
cd apps/mobile && bun run test
```

## What it shares with the desktop

| From `packages/shared`                                           |                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `schema`, `sync` (`ensureSchema`, engine, client, `SyncRuntime`) | the same database and the same sync                           |
| `data`                                                           | reads and writes that do what the desktop's Rust functions do |
| `tokens`                                                         | the desktop's colors, radius and type scale                   |
| `modules`                                                        | module names and entity types                                 |
| `api`                                                            | the server client                                             |

Libraries match the desktop's: TanStack Query for data, TanStack Form with Zod for forms, Zustand for state, Tabler icons.
