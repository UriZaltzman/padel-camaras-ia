import { useLocalSearchParams } from 'expo-router';

import { TournamentsScreen } from '../../../tournaments/TournamentsScreen';

export default function TournamentsRoute() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  return <TournamentsScreen clubId={clubId} />;
}
