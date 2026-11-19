import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';

import { IconButton, Screen, Segmented } from '@/ui';

import { OneRmCalculator } from '../components/OneRmCalculator';
import { PlateCalculator } from '../components/PlateCalculator';
import { useUnits } from '../hooks/useUnits';

type Tab = 'plates' | 'one-rm';
const TABS = [
  { value: 'plates', label: 'Plates' },
  { value: 'one-rm', label: '1RM' },
] as const;

/** S17 Tools: plate calculator, 1RM calculator and % table (engine maths). */
export function ToolsScreen() {
  const { unit } = useUnits();
  const params = useLocalSearchParams<{ weight?: string }>();
  const initial = params.weight ? Number(params.weight) : undefined;
  const [tab, setTab] = useState<Tab>('plates');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  return (
    <Screen
      title="Tools"
      headerLeft={<IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} testID="tools-back" />}
      testID="screen-tools"
    >
      <Segmented options={TABS} value={tab} onChange={setTab} accessibilityLabel="Tool" testID="tools-tabs" />
      {tab === 'plates' ? (
        <PlateCalculator unit={unit} initial={initial && Number.isFinite(initial) ? initial : undefined} />
      ) : (
        <OneRmCalculator unit={unit} />
      )}
    </Screen>
  );
}
