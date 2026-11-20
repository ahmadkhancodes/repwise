import { router } from 'expo-router';
import { Camera, CircleAlert, ImagePlus, Images, Lock, Share2, Trash2 } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { usePro } from '@/features/billing/hooks/usePro';
import { haptics } from '@/services/haptics';
import {
  BackButton,
  Button,
  Chip,
  EmptyState,
  PressableScale,
  Screen,
  Segmented,
  Sheet,
  showToast,
  Text,
} from '@/ui';
import { useTheme } from '@/theme';

import { CompareSlider, type ViewRef } from '../components/CompareSlider';
import { PhotoGridSkeleton } from '../components/Skeletons';
import { useToday } from '../hooks/useProgress';
import { dayLabel } from '../logic/dates';
import { defaultComparePair, groupByMonth, orderPair, POSES, type Pose } from '../logic/photos';
import { useLivePhotos, type ProgressPhoto } from '../repo';
import {
  addProgressPhoto,
  removeProgressPhoto,
  resolvePhotoUri,
  sharePhoto,
  type PhotoSource,
} from '../services/photoStore';
import { shareViewAsImage } from '../services/shareImage';

type Mode = 'grid' | 'compare';
const COLS = 3;
const POSE_LABEL: Record<Pose, string> = { front: 'Front', side: 'Side', back: 'Back' };

/** S33 Progress photos (Pro): private grid, add from camera/library, compare slider, share. */
export function PhotosScreen() {
  const t = useTheme();
  const today = useToday();
  const { isPro } = usePro();
  const photos = useLivePhotos();
  const { width: screenW } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('grid');
  const [adding, setAdding] = useState(false);
  const [pose, setPose] = useState<Pose>('front');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const compareRef = useRef<ViewRef>(null);

  const groups = useMemo(() => groupByMonth(photos.data), [photos.data]);
  const pair = useMemo(() => {
    const a = photos.data.find((p) => p.id === picked[0]);
    const b = photos.data.find((p) => p.id === picked[1]);
    return a && b ? orderPair(a, b) : defaultComparePair(photos.data);
  }, [photos.data, picked]);
  const tile = Math.floor((screenW - t.spacing.screen * 2 - t.spacing.xs * (COLS - 1)) / COLS);
  const back = <BackButton fallback="/progress" />;

  const add = async (source: PhotoSource) => {
    setBusy(true);
    const res = await addProgressPhoto(source, today, pose);
    setBusy(false);
    if (res.status === 'saved') {
      setAdding(false);
      // Not a core action: the button already ticked on commit, so the toast stays silent.
      showToast({ message: 'Photo saved privately', tone: 'success', silent: true });
    } else if (res.status === 'denied') {
      showToast({ message: 'Camera access is off. You can turn it on in Settings.' });
    } else if (res.status === 'error') {
      showToast({ message: "Couldn't save that photo. Try again.", tone: 'danger' });
    }
  };

  const togglePick = (id: string) => {
    haptics.selection();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  };

  if (!isPro) {
    return (
      <Screen title="Progress photos" headerLeft={back} testID="screen-progress-photos">
        <EmptyState
          icon={Lock}
          title="Progress photos are part of Pro"
          body="Private photos that stay on your phone, with a side-by-side compare."
          actionLabel="See Pro"
          onAction={() => router.push({ pathname: '/paywall', params: { source: 'photos' } })}
          testID="photos-locked"
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Progress photos"
      headerLeft={back}
      testID="screen-progress-photos"
      footer={
        mode === 'compare' && pair ? (
          <Button
            label="Share comparison"
            icon={Share2}
            onPress={() =>
              shareViewAsImage(compareRef, `repwise-compare-${today}`, 'compare').catch(() =>
                showToast({ message: "Couldn't share right now." }),
              )
            }
            testID="compare-share"
          />
        ) : (
          <Button
            label="Add photo"
            icon={ImagePlus}
            onPress={() => setAdding(true)}
            testID="photos-add"
          />
        )
      }
    >
      <Text variant="callout" color="textSecondary">
        Private to this phone. Nothing goes to your gallery unless you share it.
      </Text>
      {photos.loading ? (
        <PhotoGridSkeleton />
      ) : photos.error ? (
        <EmptyState
          icon={CircleAlert}
          title="Photos didn't load"
          body="Your photos are safe on this phone. Try again in a moment."
          testID="photos-error"
        />
      ) : photos.data.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos yet"
          body="Same spot, same light, every few weeks. Changes you can't see in the mirror show up here."
          testID="photos-empty"
        />
      ) : (
        <>
          <Segmented
            testID="photos-mode"
            accessibilityLabel="View"
            options={[
              { value: 'grid', label: 'Photos' },
              { value: 'compare', label: 'Compare' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'compare' ? (
            pair ? (
              <Animated.View
                entering={FadeIn.duration(t.motion.duration.base)}
                style={{ gap: t.spacing.sm }}
              >
                <CompareSlider
                  viewRef={compareRef}
                  before={{
                    id: pair[0].id,
                    date: pair[0].date,
                    uri: resolvePhotoUri(pair[0].localUri) ?? '',
                  }}
                  after={{
                    id: pair[1].id,
                    date: pair[1].date,
                    uri: resolvePhotoUri(pair[1].localUri) ?? '',
                  }}
                />
                <Text variant="caption" color="textSecondary" align="center">
                  Tap two photos in the grid to compare a different pair.
                </Text>
              </Animated.View>
            ) : (
              <EmptyState
                icon={Images}
                title="Add one more photo"
                body="Two photos make a comparison."
                testID="compare-empty"
              />
            )
          ) : (
            groups.map((g) => (
              <View key={g.title} style={{ gap: t.spacing.xs }}>
                <Text variant="headline" accessibilityRole="header">
                  {g.title}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                  {g.data.map((p) => {
                    const sel = picked.indexOf(p.id);
                    return (
                      <PressableScale
                        key={p.id}
                        onPress={() => setOpen(p)}
                        onLongPress={() => togglePick(p.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Photo ${dayLabel(p.date)}${p.pose ? `, ${p.pose}` : ''}`}
                        accessibilityHint="Opens the photo. Long press to pick it for compare."
                        accessibilityState={{ selected: sel >= 0 }}
                        testID={`photo-${p.id}`}
                        style={{
                          width: tile,
                          height: Math.round(tile * (4 / 3)),
                          borderRadius: t.radius.card,
                          backgroundColor: t.colors.surface,
                          borderWidth: sel >= 0 ? 2 : 0,
                          borderColor: t.colors.accent,
                        }}
                      >
                        <Image
                          source={{ uri: resolvePhotoUri(p.localUri) ?? '' }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        {sel >= 0 ? (
                          <View
                            style={{
                              position: 'absolute',
                              top: t.spacing.xxs,
                              right: t.spacing.xxs,
                              width: t.sizes.icon,
                              height: t.sizes.icon,
                              borderRadius: t.radius.pill,
                              backgroundColor: t.colors.accent,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text variant="caption" color="onAccent">
                              {String(sel + 1)}
                            </Text>
                          </View>
                        ) : null}
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add photo"
        testID="photos-add-sheet"
      >
        <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
          {POSES.map((p) => (
            <Chip
              key={p}
              label={POSE_LABEL[p]}
              selected={pose === p}
              onPress={() => setPose(p)}
              testID={`pose-${p}`}
            />
          ))}
        </View>
        <Button
          label="Take photo"
          icon={Camera}
          onPress={() => add('camera')}
          loading={busy}
          testID="photos-camera"
        />
        <Button
          label="Choose from library"
          variant="secondary"
          icon={Images}
          onPress={() => add('library')}
          disabled={busy}
          testID="photos-library"
        />
      </Sheet>

      <Sheet
        open={open != null}
        onClose={() => setOpen(null)}
        title={open ? dayLabel(open.date) : undefined}
        testID="photo-viewer"
      >
        {open ? (
          <>
            <Image
              source={{ uri: resolvePhotoUri(open.localUri) ?? '' }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: t.radius.card }}
              resizeMode="cover"
            />
            <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Share"
                  variant="secondary"
                  icon={Share2}
                  onPress={() => sharePhoto(open.localUri)}
                  testID="photo-share"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Delete"
                  variant="destructive"
                  icon={Trash2}
                  onPress={() => {
                    removeProgressPhoto(open);
                    setOpen(null);
                    showToast({ message: 'Photo deleted' });
                  }}
                  testID="photo-delete"
                />
              </View>
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
