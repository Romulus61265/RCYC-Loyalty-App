import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Button, Caption, Eyebrow, Text } from '@/components';
import { colors, spacing } from '@/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <Eyebrow>Off course</Eyebrow>
        <Text variant="display" align="center" style={{ marginTop: spacing.sm }}>
          This page has drifted away
        </Text>
        <Caption align="center" style={{ marginTop: spacing.sm, marginBottom: spacing.xl, maxWidth: 300 }}>
          The link may have changed. Let us take you back to your voyage.
        </Caption>
        <Button label="Return home" onPress={() => router.replace('/')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.gutter, backgroundColor: colors.background },
});
