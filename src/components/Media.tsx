import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { MediaAsset } from '@/domain';
import { colors, radii, spacing } from '@/theme';
import { Eyebrow, Text } from './Typography';

/**
 * Imagery surface. Renders the brand-tone gradient first, then the DAM
 * image on top when a `uri` is available, with a soft scrim for legibility.
 */
export function MediaFrame({ media, height, style, children, rounded = true }: { media: MediaAsset; height: number; style?: ViewStyle; children?: ReactNode; rounded?: boolean }) {
  return (
    <View
      style={[{ height, borderRadius: rounded ? radii.md : 0, overflow: 'hidden' }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={media.alt}
    >
      <LinearGradient colors={[media.tone[0], media.tone[1]]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      {media.uri ? <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} /> : null}
      <LinearGradient colors={['transparent', colors.scrim]} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Full-bleed hero with editorial headline. */
export function Hero({ media, eyebrow, title, subtitle, height = 440, topInset = 0 }: { media: MediaAsset; eyebrow?: string; title: string; subtitle?: string; height?: number; topInset?: number }) {
  return (
    <MediaFrame media={media} height={height + topInset} rounded={false}>
      <View style={[styles.heroContent, { paddingTop: topInset }]}>
        {eyebrow ? <Eyebrow color={colors.textInverseMuted}>{eyebrow}</Eyebrow> : null}
        <Text variant="hero" color={colors.textInverse} accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subtitle" color={colors.textInverseMuted} style={{ marginTop: spacing.xs }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </MediaFrame>
  );
}

/** Editorial tile used in horizontal carousels (Discover, recommendations). */
export function MediaTile({ media, eyebrow, title, caption, width = 260, height = 320 }: { media: MediaAsset; eyebrow?: string; title: string; caption?: string; width?: number; height?: number }) {
  return (
    <View style={{ width }}>
      <MediaFrame media={media} height={height}>
        <View style={styles.tileContent}>
          {eyebrow ? <Eyebrow color={colors.textInverseMuted}>{eyebrow}</Eyebrow> : null}
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
  heroContent: { flex: 1, justifyContent: 'flex-end', padding: spacing.gutter, paddingBottom: spacing.xl },
  tileContent: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
});
