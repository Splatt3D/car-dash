# Car Dashboard

A full-screen iPhone web app for a car mount. It shows a Google Maps preview of where you are, plus big tiles that open Google Maps turn-by-turn navigation and YouTube Music playlists, all on one screen.

It's a launcher, not a replacement for either app: navigation runs in Google Maps and audio plays from the YouTube Music app over your car's Bluetooth as normal.

Plain HTML/CSS/JS, no build step and no dependencies.

## 1. Host it on GitHub Pages

The app must be served over HTTPS for location, the service worker and "Add to Home Screen" to work.

1. Create a new repository on GitHub, e.g. `car-dash`.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/<you>/car-dash.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then choose `main` and `/ (root)` and save.
4. After a minute the site is live at `https://<you>.github.io/car-dash/`.

To try it locally first: `python3 -m http.server 8000`, then open http://localhost:8000.

## 2. Get and restrict a Maps Embed API key (optional)

Without a key the map panel shows a placeholder with an "Open Google Maps" button. Everything else works.

1. Go to https://console.cloud.google.com/, create a project, and set up billing (the Maps Embed API is free of charge, but Google requires a billing account).
2. **APIs & Services → Library**: enable **Maps Embed API** only.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key:
   - **Application restrictions → Websites**, add `https://<you>.github.io/*` (and `http://localhost:8000/*` if you test locally).
   - **API restrictions → Restrict key**, select **Maps Embed API** only.
5. Paste the key into `config.js`:
   ```js
   window.CONFIG = { MAPS_API_KEY: "AIza..." };
   ```
   Commit and push. The key will be visible in your page source; that's normal for embed keys, and the restrictions above stop others from using it.

## 3. Add it to the iPhone home screen

1. Open your GitHub Pages URL in **Safari** (it has to be Safari).
2. Tap **Share → Add to Home Screen → Add**.
3. Launch it from the new "Dash" icon. It opens full screen without the Safari toolbar.
4. Allow location access when asked.
5. Tap the ⚙︎ gear to set your Home and Work addresses and add your playlists. To get a playlist link, open it in YouTube Music and tap **Share → Copy link**.

"Liked songs" and "Library" are example tiles that work for any account. Edit or delete them as you like.

Destinations accept a street address or `lat,lng` (e.g. `-33.92,18.42`). If you enter Home as `lat,lng`, the map uses it when location access is denied.

## 4. What this can't do

- **No YouTube Music playback controls or now-playing info.** iOS doesn't let a web page control or read another app. Use Control Center, the Lock Screen, or your car's steering-wheel controls for play/pause/skip.
- **No audio in this page.** Music plays only in the YouTube Music app.
- **Links may open in an in-app browser.** From a home-screen web app, iOS sometimes opens `music.youtube.com` or `google.com/maps` links in a browser sheet inside the app instead of the native app. If that happens, the "Open in app" banner inside that sheet usually hands off to the app.
- **No haptics.** iOS doesn't expose vibration to web pages.
- **Keeping the screen on depends on iOS.** Wake Lock needs a recent iOS (16.4+, and more reliable in home-screen apps from iOS 18.4). If it isn't supported, the app shows a one-time tip to set Auto-Lock to Never. Low Power Mode can also block it.
- **The map is a preview, not live navigation.** It centres on where you were when the app opened or came back to the foreground. It does not follow you while you drive.
- **No dark map style.** The Maps Embed API doesn't support custom styling, so the map itself stays light.

## 5. Manual device test checklist

None of these have been tested on a real iPhone yet. Check each one on your phone:

- [ ] Home-screen icon shows the green arrow and the app opens full screen.
- [ ] Location prompt appears on first launch; the map centres on your position after you allow it.
- [ ] With location denied, the map shows the "Location unavailable" message (or your Home, if it's set as lat,lng).
- [ ] A destination tile opens the Google Maps app with driving directions already set.
- [ ] With the Google Maps app deleted, a destination tile opens directions in the browser instead (after about 1.5 s).
- [ ] "YouTube Music" and the playlist tiles open the YouTube Music app (see the in-app browser caveat above).
- [ ] Coming back to the dashboard from Maps or Music works, and the map doesn't reload unnecessarily.
- [ ] Screen stays on for 5+ minutes with the app open (or the Auto-Lock tip appears once).
- [ ] Rotating to landscape in the car mount shows the map on the left and the tiles on the right, with no scrolling.
- [ ] Airplane Mode, then launch from the home screen: the app opens and shows the offline map placeholder.
- [ ] Settings changes are still there after you force-quit and reopen the app.

## Development

- Run the URL-builder tests: `node --test tests/url-builders.test.js`
- Regenerate icons (Python 3, standard library only): `python3 icons/generate_icons.py`
- After changing any app file, bump `CACHE` in `sw.js` (e.g. `car-dash-v2`) so installed copies pick up the update. `config.js` is fetched network-first, so a key change takes effect without this.

Verified in a headless browser at 390×844 and 844×390: the page doesn't scroll, the map and both tile rows are visible together, and every tappable element is at least 72×72 px.
