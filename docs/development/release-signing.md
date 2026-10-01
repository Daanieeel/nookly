# Release Signing

Releases carry detached GPG signatures (`<file>.asc`) for the Linux packages (`.deb`, `.rpm`, `.AppImage`) and for `SHA256SUMS`, which covers every other platform. The `notes` job in `release.yml` creates them. This is separate from the Tauri updater key, which signs update bundles.

## One time setup

```sh
gpg --quick-generate-key "Nookly Releases <email>" ed25519 sign 3y
gpg --armor --export <fingerprint> > nookly-release.asc
gpg --armor --export-secret-keys <fingerprint>
```

Commit `nookly-release.asc` at the repo root. Add repo secrets `GPG_PRIVATE_KEY` (the armored secret key) and `GPG_PASSPHRASE`. Without the secret the job warns and skips. With it, the job fails if the secret key does not match `nookly-release.asc`.

## Verify a download

```sh
curl -O https://raw.githubusercontent.com/<repo>/main/nookly-release.asc
gpg --import nookly-release.asc
gpg --verify Nookly_<version>_amd64.deb.asc Nookly_<version>_amd64.deb
```

## Rotation

Before expiry, extend it (`gpg --quick-set-expire`) and re-export `nookly-release.asc`. A new key means a new committed public key and updated secrets in the same commit.
