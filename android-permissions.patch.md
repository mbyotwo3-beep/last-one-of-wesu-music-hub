# Android Permissions for Background Audio

**Apply after running `npx cap sync android`**

Add the following permissions to `android/app/src/main/AndroidManifest.xml`
inside the `<manifest>` tag, before the `<application>` tag:

```xml
<!-- Background audio playback (WESU+ feature: wesu-plus-completion, Req 16.3) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
```

These permissions are required by `@capgo/native-audio` to keep audio playing
when the app moves to the background or the screen is locked.

## Steps

```bash
# 1. Add the Capacitor Android platform (first time only)
npx cap add android

# 2. Sync web assets and plugins
npx cap sync android

# 3. Edit android/app/src/main/AndroidManifest.xml
#    Add the two permissions lines shown above.

# 4. Open in Android Studio to build & run
npx cap open android
```
