import { useLocalSearchParams } from 'expo-router';

import { MatchScreen } from '../../matches/MatchScreen';

export default function MatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MatchScreen matchId={id} />;
}
