package com.wesu.music;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tiny bridge so the web player can hold/release background priority:
 * start() promotes the playback service while audio plays, stop() releases
 * it on pause/exit. All calls are best-effort — failures resolve as
 * rejections the JS side swallows, so playback never depends on this.
 */
@CapacitorPlugin(name = "WesuPlayback")
public class WesuPlaybackPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), WesuPlaybackService.class);
            intent.setAction("com.wesu.music.PLAYBACK_START");
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "start failed");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), WesuPlaybackService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "stop failed");
        }
    }

    /**
     * Whether playback notifications (shade + lock-screen controls) can
     * currently show. False when the user denied POST_NOTIFICATIONS — the
     * top reason for "no notification buttons" reports.
     */
    @PluginMethod
    public void notificationsEnabled(PluginCall call) {
        try {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            JSObject ret = new JSObject();
            ret.put("enabled", enabled);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "query failed");
        }
    }

    /** Opens this app's notification settings so the user can re-allow. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= 26) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(
                    android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "open failed");
        }
    }

    /**
     * Fires the Android 13+ POST_NOTIFICATIONS prompt. The system only shows it
     * while the app is in the foreground, and without it the player
     * notification (shade + lock-screen buttons) cannot exist at all — so we
     * ask once, the first time a track plays. Resolves as soon as the dialog
     * is up; the web side re-checks the state afterwards.
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT < 33) {
                call.resolve();
                return;
            }
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            if (enabled) {
                call.resolve();
                return;
            }
            android.app.Activity activity = getActivity();
            if (activity == null) {
                call.resolve();
                return;
            }
            activity.runOnUiThread(
                    () -> {
                        try {
                            androidx.core.app.ActivityCompat.requestPermissions(
                                    activity,
                                    new String[] {android.Manifest.permission.POST_NOTIFICATIONS},
                                    9731);
                        } catch (Exception ignored) {
                            // no-op: the settings path in the UI still works
                        }
                    });
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "request failed");
        }
    }

    /**
     * Battery-exemption state for background survival. Xiaomi / Oppo /
     * Transsion (Tecno, Infinix, Itel) / Samsung kill background audio
     * without it — foreground service or not. Returns the device brand too
     * so the app can show the right extra steps (Autostart, App Freeze…).
     */
    @PluginMethod
    public void batteryExempt(PluginCall call) {
        try {
            boolean exempt = true;
            if (Build.VERSION.SDK_INT >= 23) {
                android.os.PowerManager pm =
                    (android.os.PowerManager)
                        getContext().getSystemService(android.content.Context.POWER_SERVICE);
                exempt = pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
            JSObject ret = new JSObject();
            ret.put("exempt", exempt);
            ret.put("brand", Build.MANUFACTURER != null ? Build.MANUFACTURER : "");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "query failed");
        }
    }

    /** Opens the system "ignore battery optimizations" prompt for this app. */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= 23) {
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(
                    android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(
                    android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "open failed");
        }
    }
}
