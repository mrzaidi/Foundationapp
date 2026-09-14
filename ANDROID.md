# Android app (TWA)

The Android app is a **Trusted Web Activity**: a thin native shell that renders
the live Vercel site in Chrome, full-screen, with no browser UI. There is no
second copy of the app to maintain — `git push` → Vercel deploys → the app
shows the new build on next launch. You only rebuild the APK when the name,
icon, package id or start URL changes.

## One-time setup

**Deploy this repo to Vercel first.** Bubblewrap reads the manifest off the
live site, and the PNG icons plus the `.well-known` middleware exemption only
exist after this deploy lands. Check both before running `init`:

```bash
curl -o /dev/null -w "%{http_code}
" https://foundationapp-eight.vercel.app/icons/icon-512.png
curl -o /dev/null -w "%{http_code}
" https://foundationapp-eight.vercel.app/.well-known/assetlinks.json
```

Both must be `200`. A `307` on the second one means the middleware matcher is
still eating the path.

Prereqs: JDK 17 and Node. Bubblewrap downloads the Android SDK itself.

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://foundationapp-eight.vercel.app/manifest.webmanifest
```

Answer the prompts:

| Prompt | Value |
|---|---|
| Application id | `com.shfoundation.app` |
| Display mode | `standalone` |
| Signing key | create new (remember the passwords) |

Then build:

```bash
bubblewrap build          # -> app-release-signed.apk + app-release-bundle.aab
```

## Link the app to the domain (removes the URL bar)

Without this the app still works but shows a Chrome address bar at the top.

```bash
bubblewrap fingerprint list     # copy the SHA-256 value
```

Paste it into `public/.well-known/assetlinks.json` (replace
`REPLACE_WITH_SHA256_FINGERPRINT_OF_YOUR_KEYSTORE`), commit, deploy. Verify:

```
https://foundationapp-eight.vercel.app/.well-known/assetlinks.json
```

Reinstall the APK after the file is live — Chrome caches the check.

## Distributing the APK

- **Sideload:** drop `app-release-signed.apk` somewhere downloadable (a GitHub
  release, or `public/app.apk` in this repo) and share the link. Users must
  allow "install from unknown sources" once.
- **Play Store:** upload the `.aab`. Play re-signs the app, so use the SHA-256
  from Play Console → Setup → App integrity in `assetlinks.json`, not the local
  one.

## Keystore

`android.keystore` + `bubblewrap` config live outside this repo. Losing the
keystore means you can never update a Play Store listing again — back it up.
Never commit it.

## Notes

- Login survives because the TWA shares Chrome's cookie jar.
- Needs Android 8+ with Chrome installed.
- Native-only features (push, camera API, offline) are not part of this shell.
  Those would need Capacitor instead — a much bigger change.
