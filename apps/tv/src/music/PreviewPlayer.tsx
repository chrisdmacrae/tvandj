import { createVideoPlayer } from 'expo-video';
import { useEffect, type ReactNode } from 'react';
import { PreviewProvider, usePreview, type CreatePreviewAudio } from '@tv-and-j/core/state/PreviewPlayer';
import { useMusic } from './MusicPlayer';

const RELEASE_DELAY_MS = 500;

/** Deezer clips through expo-video, like the music player. */
const createAudio: CreatePreviewAudio = ({ onEnded, onError, onPlaying }) => {
  const p = createVideoPlayer(null);
  const subs = [
    p.addListener('playToEnd', onEnded),
    p.addListener('statusChange', ({ status }) => status === 'error' && onError()),
    p.addListener('playingChange', ({ isPlaying }) => isPlaying && onPlaying()),
  ];
  return {
    load: (url) => p.replaceAsync({ uri: url }),
    play: () => p.play(),
    pause: () => p.pause(),
    release: () => {
      subs.forEach((s) => s.remove());
      setTimeout(() => p.release(), RELEASE_DELAY_MS);
    },
  };
};

/** Previews and artist radio. Starting one pauses your music; your music starting stops it. Inside MusicPlayerProvider. */
export function PreviewPlayerProvider({ children }: { children: ReactNode }) {
  const music = useMusic();
  return (
    <PreviewProvider createAudio={createAudio} onStart={() => music.isPlaying && music.pause()}>
      <StopForMusic playing={music.isPlaying} />
      {children}
    </PreviewProvider>
  );
}

function StopForMusic({ playing }: { playing: boolean }) {
  const { stop } = usePreview();
  useEffect(() => {
    if (playing) stop();
  }, [playing, stop]);
  return null;
}
