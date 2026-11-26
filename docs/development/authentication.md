# Authentication

How accounts sign in on the sync server. Reasons are in [`DECISIONS.md`](DECISIONS.md), D101 to D110. Passkeys and Sign in with Apple are not offered yet.

## Account model

![Account model](../assets/auth-account-model.svg)

## Sign in

![Sign in](../assets/auth-sign-in.svg)

## Change how you sign in

The device that disconnects the method it signed in with signs out and keeps its data. Only Sign Out Device, on the list of devices, clears another device (D110).

![Change how you sign in](../assets/auth-account-changes.svg)
