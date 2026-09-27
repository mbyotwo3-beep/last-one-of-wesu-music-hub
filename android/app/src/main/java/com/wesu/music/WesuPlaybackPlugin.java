package com.wesu.music;

import android.content.Intent;
import androidx.core.content.ContextCompat;
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
}
