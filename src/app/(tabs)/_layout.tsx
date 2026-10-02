import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, fonts } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'voyage', title: 'Voyage', icon: 'boat-outline', iconActive: 'boat' },
  { name: 'discover', title: 'Discover', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'concierge', title: 'Concierge', icon: 'chatbubble-ellipses-outline', iconActive: 'chatbubble-ellipses' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? t.iconActive : t.icon} color={color} size={size - 4} />,
          }}
        />
      ))}
    </Tabs>
  );
}
