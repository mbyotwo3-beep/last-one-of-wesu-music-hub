package com.wesu.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps music playing when the app is swiped away or the system gets
 * aggressive (Spotify-style background survival).
 *
 * The audio itself still plays in the @capgo/native-audio ExoPlayer and its
 * notification keeps the transport buttons — this service only holds process
 * priority (foregroundServiceType="mediaPlayback") so the OS doesn't kill
 * playback. Its own notification is a minimal silent "tap to open" entry
 * that exists only while the service runs.
 *
 * Self-healing: a watchdog polls AudioManager.isMusicActive() and stops the
 * service after ~15s of silence, so a pause issued on the player
 * notification (which bypasses JS when the WebView is dead) can never leave
 * a stale "Playing" notification or a pointless held process behind. If the
 * OS kills the process, START_STICKY restarts the service with no playback
 * and the same watchdog shuts it straight back down.
 */
public class WesuPlaybackService extends Service {

    private static final String CHANNEL_ID = "wesu_playback";
    private static final int NOTIFICATION_ID = 4201;
    private static final long WATCHDOG_INTERVAL_MS = 5000;
    private static final int MAX_QUIET_TICKS = 3;

    private Handler handler;
    private int quietTicks = 0;

    private final Runnable watchdog =
            new Runnable() {
                @Override
                public void run() {
                    if (isMusicActive()) {
                        quietTicks = 0;
                    } else {
                        quietTicks++;
                    }
                    if (quietTicks >= MAX_QUIET_TICKS) {
                        stopSelf();
                        return;
                    }
                    if (handler != null) {
                        handler.postDelayed(this, WATCHDOG_INTERVAL_MS);
                    }
                }
            };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannel();
        try {
            ServiceCompat.startForeground(
                    this, NOTIFICATION_ID, buildNotification(), mediaPlaybackType());
        } catch (Exception e) {
            // Restricted start (or old runtime): run unprotected rather than
            // crashing — never worse than having no service at all.
            return START_STICKY;
        }
        quietTicks = 0;
        if (handler == null) {
            handler = new Handler(Looper.getMainLooper());
        }
        handler.removeCallbacks(watchdog);
        handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            if (handler != null) {
                handler.removeCallbacks(watchdog);
            }
        } catch (Exception ignored) {
        }
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    /** mediaPlayback type constant without tripping field resolution on pre-29 runtimes. */
    private static int mediaPlaybackType() {
        if (Build.VERSION.SDK_INT < 29) {
            return 0;
        }
        return android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
    }

    private boolean isMusicActive() {
        try {
            AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            return audioManager != null && audioManager.isMusicActive();
        } catch (Exception e) {
            // Fail open: never kill possibly-live audio over a probe error.
            return true;
        }
    }

    private void ensureChannel() {
        try {
            if (Build.VERSION.SDK_INT < 26) {
                return;
            }
            NotificationManager manager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) {
                return;
            }
            NotificationChannel channel =
                    new NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Keeps Wesu+ music playing in the background");
            channel.setSound(null, null);
            channel.enableVibration(false);
            manager.createNotificationChannel(channel);
        } catch (Exception ignored) {
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open, flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_music_note)
                .setContentTitle("Wesu+")
                .setContentText("Playing — tap to open")
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setSilent(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();
    }
}
