package com.jtcoder.barrelstorm;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Checks GitHub Releases for a newer APK, downloads it and hands it to the Android package installer.
 * Android only installs the APK over the existing app if it is signed with the same key.
 */
final class UpdateManager {
    static final String REPO = "jt-coder321/barrelstorm";
    private static final String LATEST_URL = "https://api.github.com/repos/" + REPO + "/releases/latest";
    private static final String DOWNLOAD_PREFIX = "https://github.com/" + REPO + "/releases/download/";
    static final String ACTION_INSTALL_STATUS = "com.jtcoder.barrelstorm.INSTALL_STATUS";
    private static final String UA = "Barrelstorm-Updater";

    private static volatile UpdateManager current;

    private final Activity activity;
    private final WebView web;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    UpdateManager(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        current = this;
    }

    static UpdateManager get() {
        return current;
    }

    void shutdown() {
        if (current == this) current = null;
        io.shutdownNow();
    }

    private File updateDir() {
        File d = new File(activity.getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    /** Removes APKs from earlier downloads (called on launch, so after an update the old file is gone). */
    void cleanOldDownloads() {
        io.execute(() -> {
            File[] files = updateDir().listFiles();
            if (files == null) return;
            for (File f : files) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        });
    }

    // ---------- JavaScript callbacks ----------

    private void js(String script) {
        activity.runOnUiThread(() -> web.evaluateJavascript(script, null));
    }

    private void jsRelease(String json) {
        js("window.__bsRelease && window.__bsRelease(" + JSONObject.quote(json) + ")");
    }

    private void jsReleaseError(String msg) {
        js("window.__bsReleaseError && window.__bsReleaseError(" + JSONObject.quote(msg) + ")");
    }

    void jsState(String state, String msg) {
        js("window.__bsDownloadState && window.__bsDownloadState(" + JSONObject.quote(state) + "," + JSONObject.quote(msg == null ? "" : msg) + ")");
    }

    private void jsProgress(long done, long total) {
        js("window.__bsDownloadProgress && window.__bsDownloadProgress(" + done + "," + total + ")");
    }

    // ---------- check ----------

    void fetchLatestRelease() {
        io.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(LATEST_URL).openConnection();
                c.setConnectTimeout(12000);
                c.setReadTimeout(15000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                c.setRequestProperty("User-Agent", UA);
                int code = c.getResponseCode();
                if (code == 404) {
                    jsReleaseError("No release has been published yet.");
                    return;
                }
                if (code == 403 || code == 429) {
                    jsReleaseError("GitHub is rate limiting this device. Try again in a few minutes.");
                    return;
                }
                if (code != 200) {
                    jsReleaseError("GitHub answered " + code + ".");
                    return;
                }
                try (InputStream in = c.getInputStream()) {
                    jsRelease(readAll(in, 1_000_000));
                }
            } catch (Exception e) {
                jsReleaseError("Could not reach GitHub. Check your connection.");
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    private static String readAll(InputStream in, int limit) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > limit) throw new Exception("response too large");
        }
        return out.toString("UTF-8");
    }

    // ---------- download + install ----------

    private static boolean allowedHost(URL u) {
        String h = u.getHost().toLowerCase(Locale.US);
        return "https".equals(u.getProtocol())
                && (h.equals("github.com") || h.endsWith(".githubusercontent.com"));
    }

    void downloadAndInstall(String url, String name, long expectedSize, String expectedSha256) {
        if (url == null || !url.startsWith(DOWNLOAD_PREFIX)) {
            jsState("error", "Refusing to download from an unexpected address.");
            return;
        }
        if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}\\.apk")) {
            jsState("error", "Unexpected file name in the release.");
            return;
        }
        if (!busy.compareAndSet(false, true)) return;
        io.execute(() -> {
            try {
                File target = new File(updateDir(), name);
                boolean have = target.exists() && target.length() > 0
                        && (expectedSize <= 0 || target.length() == expectedSize)
                        && (expectedSha256.isEmpty() || expectedSha256.equalsIgnoreCase(sha256(target)));
                if (!have) {
                    download(url, target, expectedSize, expectedSha256);
                }
                install(target);
            } catch (Exception e) {
                String m = e.getMessage();
                jsState("error", m == null || m.isEmpty() ? "The download failed. Try again." : m);
            } finally {
                busy.set(false);
            }
        });
    }

    private void download(String url, File target, long expectedSize, String expectedSha256) throws Exception {
        File part = new File(target.getParentFile(), target.getName() + ".part");
        URL u = new URL(url);
        HttpURLConnection c = null;
        for (int hop = 0; hop < 6; hop++) {
            if (!allowedHost(u)) throw new Exception("Download redirected to an unexpected host.");
            c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", UA);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("Bad redirect from GitHub.");
                u = new URL(u, loc);
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("GitHub answered " + code + " for the download.");
            }
            break;
        }
        if (c == null || c.getResponseCode() != 200) throw new Exception("Too many redirects.");

        long total = c.getContentLengthLong();
        if (total <= 0) total = expectedSize;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        long done = 0;
        long lastReport = 0;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                md.update(buf, 0, n);
                done += n;
                long now = System.currentTimeMillis();
                if (now - lastReport > 150) {
                    lastReport = now;
                    jsProgress(done, total);
                }
            }
        } finally {
            c.disconnect();
        }
        jsProgress(done, total);
        jsState("verifying", "");
        if (expectedSize > 0 && done != expectedSize) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            throw new Exception("The download was incomplete. Try again.");
        }
        if (!expectedSha256.isEmpty() && !expectedSha256.equalsIgnoreCase(hex(md.digest()))) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            throw new Exception("The download did not match its checksum, so it was discarded.");
        }
        //noinspection ResultOfMethodCallIgnored
        target.delete();
        if (!part.renameTo(target)) throw new Exception("Could not save the download.");
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.US, "%02x", x));
        return sb.toString();
    }

    private void install(File apk) throws Exception {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            // First time only: the user has to allow this app to install updates.
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            jsState("need_permission", "");
            return;
        }

        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("barrelstorm.apk", 0, apk.length())) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            Intent cb = new Intent(ACTION_INSTALL_STATUS).setClass(activity, InstallReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(activity.getApplicationContext(), id, cb, flags);
            jsState("installing", "");
            session.commit(pi.getIntentSender());
        } catch (Exception e) {
            installer.abandonSession(id);
            throw e;
        }
    }

    /** Called by InstallReceiver with the final status from the system installer. */
    static void onInstallStatus(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        UpdateManager m = get();
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = getConfirmIntent(intent);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(confirm);
            }
        } else if (status != PackageInstaller.STATUS_SUCCESS && m != null) {
            if (status == PackageInstaller.STATUS_FAILURE_ABORTED) m.jsState("error", "The install was cancelled.");
            else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) {
                m.jsState("error", "Android rejected the update (it was signed with a different key or is not compatible). " + (message == null ? "" : message));
            } else m.jsState("error", "The install failed: " + (message == null ? "status " + status : message));
        }
    }

    @SuppressWarnings("deprecation")
    private static Intent getConfirmIntent(Intent i) {
        if (Build.VERSION.SDK_INT >= 33) return i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
        return i.getParcelableExtra(Intent.EXTRA_INTENT);
    }
}
