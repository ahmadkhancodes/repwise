import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** S12 deep link (/today/card/<id>, e.g. from a notification): opens Today with that card's sheet. */
export default function AssistantCardRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/today?card=${encodeURIComponent(String(id ?? ''))}` as Href} />;
}
