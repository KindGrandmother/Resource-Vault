# Resource Vault Starter

A local desktop resource manager for proxies, gift cards, SlyNumber numbers, Google Voice numbers, and WhatsApp numbers.

## Security choices

- SQLite stays on the local computer.
- Secret values are encrypted through Electron `safeStorage`, which uses the operating system's cryptography.
- The Electron renderer uses context isolation, sandboxing, no Node.js integration, and a narrow preload API.
- CVV is deliberately not stored.
- Revealed secrets auto-hide after 10 seconds.

## Requirements

- Windows 10/11, macOS, or Linux
- Node.js 20 or newer
- npm

## Run in development

```bash
npm install
npm run dev
```

## Build an installer

```bash
npm run build
```

The generated installer is placed in the `dist` or builder output directory, depending on your platform.

## Where the database lives

Electron stores `resource-vault.sqlite` inside the operating system's app-data directory returned by `app.getPath('userData')`.

On Windows this is normally under:

```text
%APPDATA%\Resource Vault\
```

## Suggested next features

1. Encrypted export and restore using a user-created backup password.
2. Renewal reminders and an expiration calendar.
3. Tags, custom resource types, and custom fields.
4. CSV import with duplicate detection.
5. Balance transaction history instead of storing only the latest balance.
6. Audit history for edits and reveals.
7. Optional app lock with inactivity timeout.

## Important

Do not use this project to store CVV/CVC values, PINs, recovery codes, or secrets belonging to someone else. The current gift-card form is meant for legitimate inventory and balance tracking.
