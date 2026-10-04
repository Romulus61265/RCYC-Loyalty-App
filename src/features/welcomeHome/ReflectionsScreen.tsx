/**
 * Reflections after the voyage: one gentle question at a time, each
 * optional, saved as the guest goes, sent once to the Suite Ambassador.
 * The moments to choose from are the guest's own; there are no ratings.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View, type Text as RNText } from 'react-native';
import { router } from 'expo-router';
import { focusTarget, useFocusOnChange } from '@/hooks/useFocusOnChange';
import { Button, Caption, Card, Chip, ChipGroup, ErrorState, Eyebrow, InlineError, LoadingState, Screen, Text, TextField, TextLink, ToggleRow } from '@/components';
import type { AppError } from '@/core/errors';
import type { FeedbackPatch, VoyageFeedback, VoyageRecap } from '@/domain';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { useReflections } from './usePostVoyage';
import { reflectionSteps, reviewLines, WORD_OPTIONS } from './welcomeHomeModel';

export function ReflectionsScreen() {
  const { recap: state, feedback, save, send, busy, error } = useReflections();
  const recap = state.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/welcome-home'));
  if (state.loading && !recap) return <LoadingState label="One moment…" />;
  if (state.error || !recap || !feedback) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={state.error} onRetry={state.reload} />
      </View>
    );
  }

  const ambassador = recap.thankYou.signature.split(' ')[0] ?? 'Your Suite Ambassador';
  if (feedback.status === 'sent') {
    return (
      <Screen>
        <BackBar onBack={close} />
        <View style={styles.page}>
          <Eyebrow>Your reflections</Eyebrow>
          <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
            Thank you.
          </Text>
          <Text variant="subtitle" style={{ marginTop: spacing.md }}>
            {ambassador} will read every word{feedback.thanks.length ? ', and pass your thanks on by name' : ''}.
          </Text>
          {feedback.followUpRequestId ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text color={colors.textSecondary}>You asked for someone to get in touch, so {ambassador} will.</Text>
              <View style={{ marginTop: spacing.xs }}>
                <TextLink label="Follow it in Your requests" onPress={() => router.push(`/requests/${feedback.followUpRequestId}`)} />
              </View>
            </View>
          ) : null}
          <View style={{ marginTop: spacing.xl }}>
            <Button label="Back to your voyage" variant="quiet" onPress={() => router.replace('/welcome-home')} />
          </View>
        </View>
      </Screen>
    );
  }

  return <ReflectionsFlow recap={recap} initial={feedback} save={save} send={send} busy={busy} error={error} close={close} ambassador={ambassador} />;
}

function ReflectionsFlow({
  recap,
  initial,
  save,
  send,
  busy,
  error,
  close,
  ambassador,
}: {
  recap: VoyageRecap;
  initial: VoyageFeedback;
  save: (patch: FeedbackPatch) => Promise<boolean>;
  send: () => Promise<boolean>;
  busy: boolean;
  error?: AppError;
  close: () => void;
  ambassador: string;
}) {
  const steps = useMemo(() => reflectionSteps(recap), [recap]);
  const [index, setIndex] = useState(0);
  // Each new question is read out from its heading, not left behind the Next button.
  const headingRef = useFocusOnChange<RNText>(index);
  // The guest's answers while they write, starting from what was saved; saved on each step.
  const [favourites, setFavourites] = useState<string[]>(initial.favourites);
  const [words, setWords] = useState<string[]>(initial.words);
  const [thanks, setThanks] = useState<Record<string, string>>(() => Object.fromEntries(initial.thanks.map((t) => [t.crewId, t.note ?? ''])));
  const [better, setBetter] = useState(initial.better ?? '');
  const [followUp, setFollowUp] = useState(initial.followUp);
  const [nextTime, setNextTime] = useState(initial.nextTime ?? '');
  const feedback = initial;

  const step = steps[index]!;
  const patchFor = (key: string): FeedbackPatch | null => {
    switch (key) {
      case 'moments':
        return { favourites };
      case 'words':
        return { words };
      case 'thanks':
        return { thanks: Object.entries(thanks).map(([crewId, note]) => ({ crewId, ...(note.trim() ? { note } : {}) })) };
      case 'better':
        return { better, followUp };
      case 'nextTime':
        return { nextTime };
      default:
        return null;
    }
  };
  const go = async (to: number) => {
    const patch = patchFor(step.key);
    if (patch && !(await save(patch))) return;
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  const lines = reviewLines(recap, { ...feedback, favourites, words, thanks: Object.keys(thanks).map((crewId) => ({ crewId })), better: better.trim() || undefined, followUp: followUp && Boolean(better.trim()), nextTime: nextTime.trim() || undefined });

  return (
    <Screen>
      <BackBar onBack={close} />
      <View style={styles.page}>
        <View
          style={styles.dots}
          accessible
          role="progressbar"
          aria-label="Your reflections"
          accessibilityValue={{ min: 1, max: steps.length, now: index + 1, text: `Step ${index + 1} of ${steps.length}` }}
          aria-valuetext={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <View key={s.key} style={[styles.dot, i <= index && styles.dotOn]} />
          ))}
        </View>
        <Eyebrow>{step.eyebrow}</Eyebrow>
        <Text ref={headingRef} {...focusTarget} variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {step.title}
        </Text>
        <Text color={colors.textSecondary} style={{ marginTop: spacing.sm }}>
          {step.hint}
        </Text>

        <View style={{ marginTop: spacing.lg }}>
          {step.key === 'moments' ? (
            <View style={{ gap: spacing.md }}>
              {recap.days
                .filter((d) => d.memories.length)
                .map((d) => (
                  <View key={d.dayNumber}>
                    <Caption style={{ marginBottom: spacing.xs }}>
                      Day {d.dayNumber} · {d.place}
                    </Caption>
                    <ChipGroup label={`Day ${d.dayNumber}, ${d.place}`} kind="checkbox" style={styles.chips}>
                      {d.memories.map((m) => (
                        <Chip key={m.id} kind="checkbox" label={m.title} accessibilityLabel={`${m.title}, day ${d.dayNumber}, ${d.place}`} selected={favourites.includes(m.id)} onPress={() => toggle(favourites, setFavourites, m.id, 5)} />
                      ))}
                    </ChipGroup>
                  </View>
                ))}
            </View>
          ) : null}

          {step.key === 'words' ? (
            <ChipGroup label="Words for the voyage" kind="checkbox" style={styles.chips}>
              {WORD_OPTIONS.map((w) => (
                <Chip key={w} kind="checkbox" label={w} selected={words.includes(w)} onPress={() => toggle(words, setWords, w, 3)} />
              ))}
            </ChipGroup>
          ) : null}

          {step.key === 'thanks' ? (
            <View style={{ gap: spacing.sm }}>
              {recap.crew.map((c) => {
                const on = c.id in thanks;
                return (
                  <Card key={c.id} style={styles.person} accessibilityLabel={`${c.name}, ${c.role}`}>
                    <View style={styles.personHead}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">{c.name}</Text>
                        <Caption>{c.role}</Caption>
                      </View>
                      <Chip
                        label={on ? 'Thanked' : 'Thank'}
                        accessibilityLabel={`${on ? 'Thanked' : 'Thank'} ${c.name}`}
                        selected={on}
                        onPress={() =>
                          setThanks((t) => {
                            if (!on) return { ...t, [c.id]: '' };
                            const { [c.id]: _gone, ...rest } = t;
                            return rest;
                          })
                        }
                      />
                    </View>
                    {on ? <TextField label={`A few words for ${c.name.startsWith('The ') ? c.name.charAt(0).toLowerCase() + c.name.slice(1) : c.name.split(' ')[0]} (optional)`} value={thanks[c.id] ?? ''} onChange={(v) => setThanks((t) => ({ ...t, [c.id]: v }))} max={300} multiline /> : null}
                  </Card>
                );
              })}
            </View>
          ) : null}

          {step.key === 'better' ? (
            <>
              <TextField label="In your own words (optional)" value={better} onChange={setBetter} max={1500} multiline placeholder="The tender in Portofino was later than we expected…" />
              {better.trim() ? <ToggleRow label="I would like someone to get in touch" hint={`${ambassador} will contact you personally.`} value={followUp} onChange={setFollowUp} /> : null}
            </>
          ) : null}

          {step.key === 'nextTime' ? <TextField label="For next time (optional)" value={nextTime} onChange={setNextTime} max={1000} multiline placeholder="The same suite, please, and the window table at Lumière." /> : null}

          {step.key === 'review' ? (
            <Card style={{ padding: spacing.lg }}>
              {lines.length ? (
                lines.map((l, i) => (
                  <Text key={i} style={{ marginTop: i ? spacing.sm : 0 }}>
                    {l}
                  </Text>
                ))
              ) : (
                <Text color={colors.textSecondary}>Nothing yet, and that is quite all right. Go back to any question, or simply close this.</Text>
              )}
            </Card>
          ) : null}
        </View>

        {error ? (
          <View style={{ marginTop: spacing.md }}>
            <InlineError error={error} />
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {step.key === 'review' ? (
            <Button label={busy ? 'Sending…' : `Send to ${ambassador}`} disabled={busy || lines.length === 0} onPress={() => void send()} />
          ) : (
            <Button label={busy ? 'Saving…' : index === steps.length - 2 ? 'Review' : 'Continue'} disabled={busy} onPress={() => void go(index + 1)} />
          )}
          {index > 0 ? <Button label="Back" variant="quiet" onPress={() => void go(index - 1)} /> : null}
        </View>
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <TextLink
            label="Save and finish later"
            role="button"
            onPress={() => {
              const patch = patchFor(step.key);
              void (patch ? save(patch) : Promise.resolve(true)).then((ok) => ok && close());
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.gutter, width: '100%', maxWidth: 720, alignSelf: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  person: { padding: spacing.md },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
