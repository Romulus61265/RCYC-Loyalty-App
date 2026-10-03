import { StyleSheet, View } from 'react-native';
import { SkeletonBlock } from '@/components';
import { CONTENT_MAX_WIDTH } from '@/components/Layout';
import { colors, radii, spacing } from '@/theme';

/** Loading layout that mirrors Home, so content settles in place without jumps. */
export function HomeSkeleton({ topInset }: { topInset: number }) {
  return (
    <View style={styles.root} accessibilityLabel="Preparing your dashboard" accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <View style={[styles.hero, { height: 460 + topInset, paddingTop: topInset + spacing.lg }]}>
        <View style={styles.column}>
          <SkeletonBlock height={12} width={180} style={styles.onDark} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock height={18} width={200} style={styles.onDark} />
          <SkeletonBlock height={40} width="85%" style={[styles.onDark, { marginTop: spacing.sm }]} />
          <SkeletonBlock height={12} width="60%" style={[styles.onDark, { marginTop: spacing.sm }]} />
          <SkeletonBlock height={2} style={[styles.onDark, { marginTop: spacing.lg }]} />
        </View>
      </View>
      <View style={styles.column}>
        <View style={{ paddingHorizontal: spacing.gutter, paddingVertical: spacing.lg }}>
          <SkeletonBlock height={12} width={160} />
          <SkeletonBlock height={20} width="80%" style={{ marginTop: spacing.sm }} />
        </View>
        {[110, 150, 200].map((h, i) => (
          <View key={i} style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}>
            <SkeletonBlock height={10} width={120} />
            <SkeletonBlock height={h} radius={radii.md} style={{ marginTop: spacing.md }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.surfaceInverse, paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  onDark: { backgroundColor: 'rgba(251,249,246,0.14)' },
});
