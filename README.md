# Cannonforge

A 3D medieval siege shooter for Android. Your cannon cart fires automatically, you drag to steer. Every
stage is generated from a different mix of realm, modifiers, formations and surprises, so no two stages
play alike.

- **Stages:** a procedural generator combines 8 realms, 18 modifiers, 16 formations, 6 pacing structures and
  3 objective types. Consecutive stages never share a mix (checked by `npm test`). Replays reroll the layout.
- **Decisions:** pick 1 of 3 cards at anvils and chests (reroll, rarity from common to mythic), choose
  safe or risky roads, trade a heart at a blood altar, pick a blessing before each boss.
- **Weapons:** 8 families (Cannon, Gatling, Crossbow, Flame, Lightning, Mortar, Frost, Rocket) with 4 forms
  each, tags from cards and 7 synergies (Napalm, Chain Barrage, Cryoblast, Skewer, Wildfire, Hunter Swarm,
  Shatter Lance). Weapons unlock through blueprints, and gain mastery.
- **Bosses:** Barrel King, Iron Golem, War Machine, Siege Engine, Dragon. Each has weak points or shields,
  phases, telegraphed attacks and vulnerable windows. Mini-bosses ambush mid-stage.
- **Modes:** Campaign (3 difficulties, stars, ranks), Daily Challenge (same seed for everyone), Endless.
- **Progress:** Forge upgrades, abilities, relics, achievements, mastery, all saved on the device. Saves from
  earlier versions are migrated.
- **Settings > Updates:** checks the latest GitHub Release, downloads the APK and opens the Android
  installer, so you never have to send APKs around by hand.

## How updates work

1. Every push to `main` runs [`.github/workflows/android.yml`](.github/workflows/android.yml). It bundles the
   game, builds a signed release APK and publishes a GitHub Release tagged `v1.0.<run number>` with the APK
   attached (`barrelstorm-v1.0.<run number>.apk`).
2. In the game, **Settings > Updates > Check for updates** asks the GitHub API for the latest release and
   compares its build number with the installed `versionCode`. If it is newer, **Download and install**
   downloads the APK (checked against the size and SHA-256 that GitHub reports), then hands it to the Android
   package installer. The game also checks quietly on launch and shows a red dot on Settings when an update
   is waiting.
3. First time only: Android asks you to allow Barrelstorm to "install unknown apps". Allow it, return to the
   game and tap the button again.

## Signing key

Android only installs an update if it is signed with the **same key** as the installed app, so every release
uses one key. This is a personal game, so the key is committed in `android/keystore/barrelstorm.jks`
(password `barrelstorm`) and works with no setup. Because the repository is public, anyone can read that key;
do not reuse it for anything you publish.

To use a private key instead, run `./scripts/make-signing-key.sh` (needs a JDK; with the GitHub CLI logged in it
stores the secrets for you) or add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and
`ANDROID_KEY_ALIAS` as repository secrets. The workflow uses them automatically. Switching keys after the first
install means uninstalling and reinstalling the game once, so decide before you start playing.

## Develop

```bash
npm install
npm run dev        # game in a desktop browser at http://localhost:8080 (arrows or drag to move, space = ability)
npm run build      # bundles the game into android/app/src/main/assets/game
npm test           # generator checks: no repeated stage mixes, legal modifier combos, fair layouts
npm run test:bot -- --stages 1-20   # headless bot plays stages (needs Playwright + Chromium installed)
npm run shots      # screenshots of bosses, realms and screens into test-shots/
cd android && ./gradlew assembleDebug   # needs JDK 17 and the Android SDK
```

In a desktop browser the update check works too (it calls the GitHub API), but installing only works in the
Android app.

## Layout

- `web/src/data/` content tables: weapons, cards and synergies, enemies, modifiers, formations, realms, meta progression.
- `web/src/levelgen.js` the stage generator (profiles, pacing beats, events, endless and daily).
- `web/src/game.js` the game loop and damage pipeline; `bosses.js`, `hazards.js` and `gfx.js` for bosses, hazards and models.
- `android/` a thin native wrapper: full-screen WebView, save storage and the update installer (`UpdateManager.java`).
