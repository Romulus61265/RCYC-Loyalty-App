/**
 * Sign in with a one-time code sent to the e-mail on the reservation.
 * Shown by JourneyProvider whenever there is no session.
 */
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { focusTarget, useFocusOnChange } from '@/hooks/useFocusOnChange';
import { Button, Caption, Display, Eyebrow, Text, TextField, TextLink } from '@/components';
import { colors, spacing } from '@/theme';
import { useSignIn } from './useSignIn';

export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const s = useSignIn(onSignedIn);
  // The code step replaces the button just pressed: take the screen reader to what it says.
  const leadRef = useFocusOnChange<RNText>(s.step);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <Eyebrow color={colors.accentText}>The Yacht Collection</Eyebrow>
            <Display style={{ marginTop: spacing.sm }}>Welcome aboard</Display>
            {s.step === 'email' ? (
              <>
                <Text style={styles.lead}>Enter the e-mail address on your reservation and we’ll send you a six-digit code.</Text>
                <TextField
                  label="E-mail address"
                  value={s.email}
                  onChange={s.setEmail}
                  placeholder="you@example.com"
                  max={254}
                  showCount={false}
                  error={s.message ?? undefined}
                  input={{ keyboardType: 'email-address', autoComplete: 'email', textContentType: 'emailAddress', autoCapitalize: 'none', autoCorrect: false, returnKeyType: 'send', onSubmitEditing: () => void s.requestCode() }}
                />
                <View style={styles.actions}>
                  <Button label={s.busy ? 'Sending…' : 'Send my code'} onPress={() => void s.requestCode()} disabled={s.busy} />
                </View>
              </>
            ) : (
              <>
                <Text ref={leadRef} {...focusTarget} style={styles.lead}>
                  If {s.email.trim()} is on a reservation, a code is on its way. It is valid for ten minutes.
                </Text>
                <TextField
                  label="Six-digit code"
                  value={s.code}
                  onChange={(v) => s.setCode(v.replace(/\D/g, ''))}
                  placeholder="123456"
                  max={6}
                  showCount={false}
                  error={s.message ?? undefined}
                  input={{ keyboardType: 'number-pad', autoComplete: 'one-time-code', textContentType: 'oneTimeCode', returnKeyType: 'done', onSubmitEditing: () => void s.verify() }}
                />
                <View style={styles.actions}>
                  <Button label={s.busy ? 'Signing in…' : 'Sign in'} onPress={() => void s.verify()} disabled={s.busy} />
                  <TextLink label="Use a different address" role="button" onPress={s.startOver} />
                </View>
              </>
            )}
            <Caption style={{ marginTop: spacing.xl }}>We never ask for a password. Your concierge can help if you no longer use this address.</Caption>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  lead: { marginTop: spacing.md, marginBottom: spacing.lg },
  actions: { marginTop: spacing.lg, gap: spacing.md },
});
