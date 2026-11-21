package com.jtcoder.barrelstorm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives the result of a PackageInstaller session (confirmation request, success or failure). */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !UpdateManager.ACTION_INSTALL_STATUS.equals(intent.getAction())) return;
        UpdateManager.onInstallStatus(context, intent);
    }
}
