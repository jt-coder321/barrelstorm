package com.jtcoder.barrelstorm;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the game (a bundled web app) in a full-screen WebView and exposes a small native bridge. */
public class MainActivity extends Activity {
    private static final String GAME_URL = "file:///android_asset/game/index.html";
    private static final String PREFS = "barrelstorm";
    private static final String KEY_SAVE = "save";

    private WebView web;
    private UpdateManager updates;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        web.setBackgroundColor(0xFF1A120B);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);

        updates = new UpdateManager(this, web);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The game never navigates away from its own bundled pages.
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate();
                return true;
            }
        });
        web.loadUrl(GAME_URL);
        updates.cleanOldDownloads();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.__onAppPause && window.__onAppPause()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Let the game handle Back (close a menu, pause). Exit only when it declines.
        web.evaluateJavascript("window.__onBack ? window.__onBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (updates != null) updates.shutdown();
        web.removeJavascriptInterface("AndroidBridge");
        web.destroy();
        super.onDestroy();
    }

    /** Methods callable from the game's JavaScript as window.AndroidBridge.*. */
    private class Bridge {
        @JavascriptInterface
        public String getVersionName() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return p.versionName == null ? "unknown" : p.versionName;
            } catch (Exception e) {
                return "unknown";
            }
        }

        @JavascriptInterface
        public int getVersionCode() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return (int) p.getLongVersionCode();
            } catch (Exception e) {
                return 0;
            }
        }

        /** Asks GitHub for the latest release; the answer arrives via window.__bsRelease(json). */
        @JavascriptInterface
        public void checkForUpdate(String ignored) {
            updates.fetchLatestRelease();
        }

        @JavascriptInterface
        public void downloadAndInstall(String url, String name, long size, String sha256) {
            updates.downloadAndInstall(url, name, size, sha256);
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                long d = Math.max(5, Math.min(200, ms));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(d);
            } catch (Exception ignored) {
                // Haptics are optional.
            }
        }

        @JavascriptInterface
        public String loadSave() {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            return p.getString(KEY_SAVE, "");
        }

        @JavascriptInterface
        public void saveData(String json) {
            SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
            if (json == null || json.isEmpty()) e.remove(KEY_SAVE);
            else if (json.length() < 200_000) e.putString(KEY_SAVE, json);
            e.apply();
        }
    }
}
