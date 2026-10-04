import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Eyebrow, MediaFrame, Text } from '@/components';
import { CONTENT_MAX_WIDTH } from '@/components/Layout';
import { colors, spacing } from '@/theme';
import type { HeroModel, JourneyStep } from '../homeModel';

/**
 * Answers "Where am I in my journey?": greeting, the phase in words, the
 * headline (countdown or today's port) and a quiet five-step journey line.
 */
export function HomeHero({ hero, topInset, accessory }: { hero: HeroModel; topInset: number; accessory?: ReactNode }) {
  return (
    <MediaFrame media={hero.media} height={460 + topInset} rounded={false} scrim="both">
      <View style={[styles.content, { paddingTop: topInset + spacing.lg }]}>
        <View style={styles.column}>
          <View style={styles.top}>
            <Eyebrow color={colors.textOnImageMuted} style={{ flex: 1 }}>
              {hero.greeting}
            </Eyebrow>
            {accessory}
          </View>
          <View style={{ flex: 1 }} />
          <Text variant="subtitle" color={colors.accentSoft}>
            {hero.phaseLabel}
          </Text>
          <Text variant="hero" color={colors.textInverse} accessibilityRole="header" aria-level={1} style={{ marginTop: spacing.xxs }}>
            {hero.headline}
          </Text>
          <Text variant="caption" color={colors.textOnImageMuted} style={{ marginTop: spacing.xs }}>
            {hero.subline}
          </Text>
          <JourneySteps steps={hero.steps} />
        </View>
      </View>
    </MediaFrame>
  );
}

export function JourneySteps({ steps }: { steps: JourneyStep[] }) {
  const current = steps.find((s) => s.state === 'current');
  const at = steps.findIndex((s) => s.state === 'current') + 1;
  const text = `${current?.label ?? ''}, stage ${at} of ${steps.length}`;
  return (
    <View
      style={styles.steps}
      accessible
      role="progressbar"
      aria-label="Your journey"
      accessibilityLabel="Your journey"
      accessibilityValue={{ min: 1, max: steps.length, now: at, text }}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={at}
      aria-valuetext={text}
    >
      {steps.map((s) => (
        <View key={s.key} style={styles.step}>
          <View
            style={[
              styles.rule,
              s.state === 'done' && { backgroundColor: colors.textOnImageMuted },
              s.state === 'current' && { backgroundColor: colors.accent },
            ]}
          />
          <Eyebrow
            color={s.state === 'current' ? colors.textInverse : colors.textOnImageMuted}
            numberOfLines={1}
            style={{ marginTop: 6, fontSize: 11, letterSpacing: 0.6 }}
          >
            {s.label}
          </Eyebrow>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH - spacing.gutter * 2, alignSelf: 'center' },
  steps: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  step: { flex: 1 },
  rule: { height: 2, borderRadius: 1, backgroundColor: 'rgba(251,249,246,0.25)' },
});
