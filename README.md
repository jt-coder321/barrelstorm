# Barrelstorm

A 3D medieval barrel shooter for Android. Drag to move your siege cart, your weapon fires automatically,
shoot the numbered barrels before they reach your castle, drive through gates to power up, and evolve your
weapon from a humble sling to the Dragon Cannon.

- **Gameplay:** auto fire, drag to steer, numbered barrels, powder kegs that chain explode, gift barrels,
  spike logs to dodge, boss every 5th stage, combo coin multipliers, 6 weapon tiers.
- **Progress:** coins and Forge upgrades (damage, fire rate, projectiles, hearts, coin bonus, starting
  weapon level) are saved on the device.
- **Settings > Updates:** checks the latest GitHub Release, downloads the APK and opens the Android
  installer, so you never have to send APKs around by hand.

## How updates work

1. Every push to `main` runs [`.github/workflows/android.yml`](.github/workflows/android.yml). It bundles the
   game, builds a release APK signed with your key and publishes a GitHub Release tagged `v1.0.<run number>` with the APK
   attached (`barrelstorm-v1.0.<run number>.apk`).
2. In the game, **Settings > Updates > Check for updates** asks the GitHub API for the latest release and
   compares its build number with the installed `versionCode`. If it is newer, **Download and install**
   downloads the APK (checked against the size and SHA-256 that GitHub reports), then hands it to the Android
   package installer. The game also checks quietly on launch and shows a red dot on Settings when an update
   is waiting.
3. First time only: Android asks you to allow Barrelstorm to "install unknown apps". Allow it, return to the
   game and tap the button again.

## Signing key

Android only installs an update if it is signed with the **same key** as the installed app, so all releases
must use one private key. It is kept out of the repository (which is public) in GitHub repository secrets.
Set it up once:

```bash
./scripts/make-signing-key.sh        # needs a JDK; with the GitHub CLI logged in it stores the secrets for you
```

Otherwise add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` under
Settings > Secrets and variables > Actions. Back the `.jks` file up: if it is lost, installed copies can no
longer be updated and the game has to be uninstalled and reinstalled. The release job refuses to publish
without the key, because an APK signed with a throwaway key would fail to install over the old one.

## Develop

```bash
npm install
npm run dev        # game in a desktop browser at http://localhost:8080 (arrow keys or drag to move)
npm run build      # bundles the game into android/app/src/main/assets/game
cd android && ./gradlew assembleDebug   # needs JDK 17 and the Android SDK
```

In a desktop browser the update check works too (it calls the GitHub API), but installing only works in the
Android app.

## Layout

- `web/` the game (Three.js, plain JavaScript): `src/config.js` has weapon tiers, Forge items and stage generation.
- `android/` a thin native wrapper: full-screen WebView, save storage and the update installer (`UpdateManager.java`).
