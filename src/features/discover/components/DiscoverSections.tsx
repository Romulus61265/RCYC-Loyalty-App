import { useDeferredValue } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Caption, Chip, ChipGroup, EmptyNote, Eyebrow, InlineError, MediaFrame, MediaTile, Section, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { DestinationCardModel, DiscoverFilters, DiscoverModel, ExperienceCardModel, InterestKey } from '../discoverModel';
import { ExperienceCard } from './ExperienceCard';

// ─── Recommended for You ───────────────────────────────────────────────────

export function RecommendedRail({ items, error, onRetry }: { items: ExperienceCardModel[]; error?: unknown; onRetry: () => void }) {
  const { width } = useWindowDimensions();
  const tile = Math.min(300, Math.max(230, width * 0.72));
  return (
    <Section eyebrow="Recommended for You" title="Chosen with you in mind">
      {error ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyNote body="As we get to know you better, we’ll suggest moments we think you’ll love." />
      ) : (
        // Focusable as a whole on the web, so a keyboard can scroll tiles that are not themselves controls.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} tabIndex={0} role="region" aria-label="Recommended for you" style={{ marginHorizontal: -spacing.gutter }} contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.md }}>
          {items.map((c) => (
            <MediaTile key={c.id} media={c.media} eyebrow={c.destination} title={c.title} caption={c.recommendation?.reason} width={tile} height={Math.round(tile * 1.15)} />
          ))}
        </ScrollView>
      )}
    </Section>
  );
}

// ─── Refine (filters) ──────────────────────────────────────────────────────

export function RefineBar({ count, open, privateOnly, onToggle, onPrivate, onClear }: { count: number; open: boolean; privateOnly: boolean; onToggle: () => void; onPrivate: () => void; onClear: () => void }) {
  return (
    <View style={styles.refineBar}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={count ? `Refine, ${count} ${count === 1 ? 'filter' : 'filters'} on` : 'Refine'} aria-expanded={open} accessibilityState={{ expanded: open }} style={styles.refineButton}>
        <Ionicons name="options-outline" size={16} color={colors.textPrimary} />
        <Eyebrow color={colors.textPrimary} style={{ marginLeft: 6 }}>
          Refine{count ? ` · ${count}` : ''}
        </Eyebrow>
      </Pressable>
      <Chip label="Private only" selected={privateOnly} onPress={onPrivate} />
      {count > 0 ? (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear filters" hitSlop={14} style={{ marginLeft: 'auto' }}>
          <Eyebrow color={colors.accentText}>Clear</Eyebrow>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterPanel({ model, filters, onChange }: { model: DiscoverModel; filters: DiscoverFilters; onChange: (f: DiscoverFilters) => void }) {
  const set = (patch: Partial<DiscoverFilters>) => onChange({ ...filters, ...patch });
  const toggleInterest = (k: InterestKey) => set({ interests: filters.interests.includes(k) ? filters.interests.filter((i) => i !== k) : [...filters.interests, k] });
  return (
    <View style={styles.panel}>
      <FilterRow label="Port" kind="radio">
        {model.options.ports.map((o) => (
          <Chip key={o.value} label={o.label} hint={o.hint} kind="radio" selected={filters.port === o.value} onPress={() => set({ port: o.value })} />
        ))}
      </FilterRow>
      <FilterRow label="Date" kind="radio">
        {model.options.dates.map((o) => (
          <Chip key={o.value} label={o.label} hint={o.hint} kind="radio" selected={filters.date === o.value} onPress={() => set({ date: o.value })} />
        ))}
      </FilterRow>
      <FilterRow label="Interests" kind="checkbox">
        {model.options.interests.map((o) => (
          <Chip key={o.value} label={o.label} hint={o.yours ? 'Yours' : undefined} kind="checkbox" selected={filters.interests.includes(o.value)} onPress={() => toggleInterest(o.value)} />
        ))}
      </FilterRow>
      <FilterRow label="Availability" kind="radio">
        <Chip kind="radio" label="Everything" selected={filters.availability === 'any'} onPress={() => set({ availability: 'any' })} />
        <Chip kind="radio" label="Bookable now" selected={filters.availability === 'open'} onPress={() => set({ availability: 'open' })} />
      </FilterRow>
    </View>
  );
}

function FilterRow({ label, kind, children }: { label: string; kind: 'radio' | 'checkbox'; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Eyebrow style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.xs }}>{label}</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.gutter }}>
        <ChipGroup label={label} kind={kind} style={{ flexWrap: 'nowrap' }}>
          {children}
        </ChipGroup>
      </ScrollView>
    </View>
  );
}

// ─── Results ───────────────────────────────────────────────────────────────

export function ExperienceResults({
  cards: incoming,
  heading,
  onRequest,
  onClear,
  saved,
  onSave,
  onView,
}: {
  cards: ExperienceCardModel[];
  heading: string;
  onRequest: (c: ExperienceCardModel) => void;
  onClear: () => void;
  saved?: ReadonlySet<string>;
  onSave?: (c: ExperienceCardModel) => void;
  onView?: (c: ExperienceCardModel) => void;
}) {
  // A filter that brings many cards back (all ports again: 26 to mount) paints the chip at once and
  // fills the list just after, in work that yields to the next tap (408–456 ms to paint before, 4× CPU).
  const cards = useDeferredValue(incoming);
  const { width } = useWindowDimensions();
  const columns = width >= 760 ? 2 : 1;
  if (cards.length === 0) {
    return (
      <Section eyebrow={heading}>
        <EmptyNote title="Nothing matches these choices" body="Try another day or port, or let your concierge arrange something bespoke." actionLabel="Clear filters" onAction={onClear} />
      </Section>
    );
  }
  return (
    <Section eyebrow={`${heading} · ${cards.length} ${cards.length === 1 ? 'experience' : 'experiences'}`}>
      <View style={[styles.grid, columns === 2 && styles.gridTwo]}>
        {cards.map((c) => (
          <View key={c.id} style={columns === 2 ? styles.cellTwo : undefined}>
            <ExperienceCard card={c} onRequest={onRequest} saved={saved?.has(c.id) ?? false} onSave={onSave} onView={onView} />
          </View>
        ))}
      </View>
    </Section>
  );
}

// ─── Destinations ──────────────────────────────────────────────────────────

export function DestinationList({ items, onOpen }: { items: DestinationCardModel[]; onOpen: (d: DestinationCardModel) => void }) {
  return (
    <Section eyebrow="Where you’ll be">
      {items.map((d) => (
        <Pressable key={d.id} onPress={() => onOpen(d)} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.country}, ${d.dateLabel}. ${d.standfirst} ${d.experienceCount} experiences${d.reservedCount ? `, ${d.reservedCount} reserved for you` : ''}`} style={{ marginBottom: spacing.md }}>
          <MediaFrame media={d.media} height={190}>
            <View style={styles.destCaption}>
              <Eyebrow color={colors.textOnImageMuted}>
                {d.country} · {d.dateLabel}
              </Eyebrow>
              <Text variant="display" color={colors.textInverse}>
                {d.name}
              </Text>
            </View>
          </MediaFrame>
          <Text style={{ marginTop: spacing.sm }}>{d.standfirst}</Text>
          <Caption style={{ marginTop: 2 }}>
            {d.experienceCount} experiences{d.reservedCount ? ` · ${d.reservedCount} reserved for you` : ''}
          </Caption>
        </Pressable>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  refineBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.gutter, marginTop: spacing.lg, width: '100%', maxWidth: 720, alignSelf: 'center' },
  refineButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  panel: { paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, width: '100%', maxWidth: 720, alignSelf: 'center' },
  grid: { gap: spacing.md },
  gridTwo: { flexDirection: 'row', flexWrap: 'wrap' },
  cellTwo: { width: '48.5%' },
  destCaption: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
});
