import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors } from '@tv-and-j/design-system';
import { TRAILER_IN_FLIGHT_KEY } from '../state/SettingsContext';

/**
 * YouTube needs to know which site is embedding it (it refuses to play, with
 * "error 153", when there's no referrer), so the page is served as if from here.
 */
const ORIGIN = 'https://tvandj.app';

/** Give up if YouTube hasn't started playing by then (blocked embed, slow network). */
const START_TIMEOUT_MS = 20_000;

type YouTubeTrailerProps = {
  /** YouTube video key. */
  videoKey: string;
  /** Actually playing, so it's safe to fade in over the artwork. */
  onPlaying: () => void;
  /** Finished, failed, refused to embed, or never started. */
  onDone: () => void;
};

function page(videoKey: string) {
  // The player is sized to cover the area (like the library preview: no letterbox) and
  // scaled up a little so YouTube's title and logo overlays sit mostly off the edges.
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:${colors.canvas}}
  #player{position:absolute;top:50%;left:50%;width:max(100vw,177.78vh);height:max(100vh,56.25vw);
    transform:translate(-50%,-50%) scale(1.15);pointer-events:none;border:0}
</style></head><body>
<div id="player"></div>
<script>
  function post(message){ window.ReactNativeWebView.postMessage(message); }
  function onYouTubeIframeAPIReady(){
    new YT.Player('player', {
      videoId: ${JSON.stringify(videoKey)},
      host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, origin: ${JSON.stringify(ORIGIN)} },
      events: {
        onReady: function(e){ e.target.playVideo(); },
        onStateChange: function(e){
          if (e.data === YT.PlayerState.PLAYING) post('playing');
          if (e.data === YT.PlayerState.ENDED) post('ended');
        },
        onError: function(e){ post('error:' + e.data); }
      }
    });
  }
</script>
<script src="https://www.youtube.com/iframe_api" onerror="post('error:script')"></script>
</body></html>`;
}

/** The web view made it through startup (it's playing, or it gave up cleanly): not a crash. */
function settle() {
  AsyncStorage.removeItem(TRAILER_IN_FLIGHT_KEY).catch(() => {});
}

/**
 * A title's trailer, played in YouTube's own player. Renders invisibly until
 * YouTube reports it's playing; anything else (an embed-blocked trailer, no
 * network, a timeout) reports done so the artwork simply stays.
 */
export function YouTubeTrailer({ videoKey, onPlaying, onDone }: YouTubeTrailerProps) {
  const started = useRef(false);
  const callbacks = useRef({ onPlaying, onDone });
  callbacks.current = { onPlaying, onDone };

  useEffect(() => {
    started.current = false;
    const timer = setTimeout(() => !started.current && finish(), START_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      settle();
    };
  }, [videoKey]);

  const onMessage = (e: WebViewMessageEvent) => {
    const message = e.nativeEvent.data;
    if (message === 'playing') {
      settle();
      if (!started.current) callbacks.current.onPlaying();
      started.current = true;
    } else {
      finish();
    }
  };
  const finish = () => {
    settle();
    callbacks.current.onDone();
  };

  return (
    <WebView
      source={{ html: page(videoKey), baseUrl: ORIGIN }}
      originWhitelist={['*']}
      onMessage={onMessage}
      onError={finish}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      // Purely a picture: nothing inside is for the remote.
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ flex: 1, backgroundColor: colors.canvas }}
    />
  );
}
