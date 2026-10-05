import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { MediaAsset } from '@/domain';
import { colors, radii, scrims, spacing } from '@/theme';
import { Eyebrow, Text } from './Typography';

/**
 * Imagery surface. Renders the brand-tone gradient first, then the DAM
 * image on top when a `uri` is available, with a soft scrim for legibility.
 *
 * The picture alone is the accessible image (its alt text); words placed
 * on it stay separate, so a screen reader reads them and finds the heading.
 * With words on it, the scrim deepens where they sit (`scrim="both"` also
 * shades the top edge, for a line at the top).
 */
export function MediaFrame({ media, height, style, children, rounded = true, scrim }: { media: MediaAsset; height: number; style?: ViewStyle; children?: ReactNode; rounded?: boolean; scrim?: 'bottom' | 'both' }) {
  const reduceMotion = useReducedMotion();
  const words = scrim ?? (children ? 'bottom' : undefined);
  return (
    // With words on it, the frame grows with larger text rather than clipping it.
    <View style={[{ height: words ? undefined : height, minHeight: height, borderRadius: rounded ? radii.md : 0, overflow: 'hidden' }, style]}>
      <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={media.alt}>
        <LinearGradient colors={[media.tone[0], media.tone[1]]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        {media.uri ? <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={reduceMotion ? 0 : 400} accessible={false} /> : null}
        {words ? (
          <LinearGradient colors={scrims.words.colors} locations={scrims.words.locations} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={['transparent', colors.scrim]} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        {words === 'both' ? <LinearGradient colors={scrims.top.colors} locations={scrims.top.locations} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      </View>
      {children}
    </View>
  );
}

/** Editorial tile used in horizontal carousels (Discover, recommendations). */
export function MediaTile({ media, eyebrow, title, caption, width = 260, height = 320 }: { media: MediaAsset; eyebrow?: string; title: string; caption?: string; width?: number; height?: number }) {
  return (
    <View style={{ width }}>
      <MediaFrame media={media} height={height}>
        <View style={styles.tileContent}>
          {eyebrow ? <Eyebrow color={colors.textOnImageMuted}>{eyebrow}</Eyebrow> : null}
          <Text variant="title" color={colors.textInverse} style={{ marginTop: spacing.xxs }}>
            {title}
          </Text>
        </View>
      </MediaFrame>
      {caption ? (
        <Text variant="caption" color={colors.textSecondary} style={{ marginTop: spacing.sm }} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tileContent: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
});
