Place the provided branding images into `public/images/` using these filenames:

- `wesu-logo.png` — wide logo (used for og:image and splash previews). 1200×630 or larger is good for OG social cards.
- `wesu-splash.png` — tall splash image for mobile app splash screens (optional). Recommend 1242×2436 (iPhone portrait) or 1440×3120.
- `wesu-icon-192.png` — 192×192 app icon (manifest). PNG with transparent background.
- `wesu-icon-512.png` — 512×512 app icon (manifest). PNG with transparent background.
- `favicon.png` — 32×32 or 48×48 favicon (PNG).

Notes & verification

- After placing files, run:

```bash
npm run build
```

- The app expects these files at the site root paths:
  - `/images/wesu-logo.png` → OG image
  - `/images/wesu-splash.png` → optional splash
  - `/images/wesu-icon-192.png` and `/images/wesu-icon-512.png` → PWA icons
  - `/favicon.png` → site favicon

Generate icon sizes (optional)

- Using ImageMagick to create required sizes from a high-res PNG (example):

```bash
# from a large source file (source.png)
magick convert source.png -resize 512x512 public/images/wesu-icon-512.png
magick convert source.png -resize 192x192 public/images/wesu-icon-192.png
magick convert source.png -resize 48x48 public/favicon.png
magick convert source.png -resize 1242x2436 public/images/wesu-splash.png
```

Android / iOS native icons

- For native platforms, either:
  - Use a tool to generate launcher icons and splash images (Android Asset Studio, Xcode asset catalogs), then replace platform assets under `android/app/src/main/res/` and the Xcode asset catalog.
  - Or use a CLI tool you prefer to generate native assets and copy them into the native projects.

Capacitor

- After building the web app, sync web assets with Capacitor:

```bash
npm run build
npx cap sync
```

- Open the native projects to finish replacing icons/splash manually if needed:

```bash
npx cap open android
npx cap open ios
```

If you want, I can:

- Add an automated icon generator step (Node script) to produce the PNG sizes from a single source image.
- Attempt to add native asset generation steps to the repo (requires an input source image).
