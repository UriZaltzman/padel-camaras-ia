// The only file that touches expo-video, so screens and tests can swap the player.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

export interface MatchVideoProps {
  /** Signed link. Held in memory only. */
  uri: string;
  /** Where to start, in ms from the start of the video. Changing `seekKey` seeks again. */
  startMs: number;
  seekKey: number;
}

export type MatchVideoComponent = (props: MatchVideoProps) => React.JSX.Element;

export function MatchVideo({ uri, startMs, seekKey }: MatchVideoProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.currentTime = startMs / 1000;
    p.play();
  });

  useEffect(() => {
    player.currentTime = startMs / 1000;
    // Seek only when asked to (seekKey), not on every render.
  }, [seekKey]);

  return <VideoView player={player} style={styles.video} nativeControls testID="match-video" />;
}

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
});
