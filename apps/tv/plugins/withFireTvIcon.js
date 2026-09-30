const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const { generateImageAsync } = require('@expo/image-utils');

/**
 * The app's icon on Fire TV.
 *
 * Fire TV's Appstore draws sideloaded apps' tiles: on install it copies the
 * app's icon (PackageManager.getApplicationIcon) and keeps that copy until the
 * app is uninstalled; updates never refresh it. It shows it as a square icon
 * on its own tile background (full-width artwork is only for Appstore apps,
 * whose images come from Amazon's servers), and it can't use Expo's adaptive
 * icon at all (you get a grey robot). So the icon is a square PNG with a
 * transparent background (so it blends into the grey tile instead of showing
 * as a dark square with grey bars beside it) in the drawable folders, and
 * release builds keep plain resource paths.
 * Android TV's launcher uses the 16:9 banner (androidTVBanner in app.json).
 *
 * Changing this artwork on a Fire TV means uninstalling and reinstalling.
 */
const NAME = 'ic_launcher_tv';
// Square, and larger than a phone icon: it's shown big in a TV tile.
const SIZES = { mdpi: 128, hdpi: 192, xhdpi: 256, xxhdpi: 384, xxxhdpi: 512 };

function withFireTvIcon(config, { icon }) {
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const { projectRoot, platformProjectRoot } = c.modRequest;
      const res = path.join(platformProjectRoot, 'app/src/main/res');
      for (const [density, size] of Object.entries(SIZES)) {
        const { source } = await generateImageAsync(
          { projectRoot, cacheType: 'fire-tv-icon' },
          { src: path.resolve(projectRoot, icon), width: size, height: size, resizeMode: 'cover' },
        );
        const dir = path.join(res, `drawable-${density}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${NAME}.png`), source);
      }
      return c;
    },
  ]);

  // Release builds shorten resource paths (res/drawable-xhdpi/tv_banner.png becomes res/O5.png).
  // Fire TV's launcher reads sideloaded APKs itself and can't find the banner or icon at
  // shortened paths, so it draws a blank tile; keep the real paths.
  config = withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key === 'android.enableResourceOptimizations'));
    c.modResults.push({ type: 'property', key: 'android.enableResourceOptimizations', value: 'false' });
    return c;
  });

  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:icon'] = `@drawable/${NAME}`;
      app.$['android:roundIcon'] = `@drawable/${NAME}`;
    }
    return c;
  });
}

module.exports = withFireTvIcon;
