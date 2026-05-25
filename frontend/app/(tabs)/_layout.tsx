import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import OvertonScreen from '../screens/OvertonScreen';


const TABS = [
  { name: 'search',   title: 'Análisis',  icon: 'search',             iconOut: 'search-outline',            emoji: '📊' },
  { name: 'market',   title: 'Mercado',   icon: 'pulse',              iconOut: 'pulse-outline',             emoji: '📈' },
  { name: 'screener', title: 'Screener',  icon: 'filter',             iconOut: 'filter-outline',            emoji: '🔍' },
  { name: 'account',  title: 'Mi Cuenta', icon: 'person',             iconOut: 'person-outline',            emoji: '💼' },
  { name: 'history',  title: 'Historial', icon: 'time',               iconOut: 'time-outline',              emoji: '🕐' },
  { name: 'OvertonScreen',  title: 'Ventana de Overton', icon: 'eye',          iconOut: 'eye-outline',        emoji: '🕐' },
  { name: 'info',     title: 'Info',      icon: 'information-circle', iconOut: 'information-circle-outline', emoji: 'ℹ️' },
];

function WebSidebar() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[styles.sidebar, {
      backgroundColor: isDark ? '#0f1117' : '#ffffff',
      borderRightColor: isDark ? '#1e2130' : '#e8ecf0',
    }]}>
      {/* Logo */}
      <View style={[styles.logoContainer, { borderBottomColor: isDark ? '#1e2130' : '#e8ecf0' }]}>
        <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoIconText}>FA</Text>
        </View>
        <View>
          <Text style={[styles.logoTitle, { color: isDark ? '#ffffff' : '#0f1117' }]}>FinAnalysis</Text>
          <Text style={[styles.logoSubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>Financial Intelligence</Text>
        </View>
      </View>

      {/* Nav label */}
      <Text style={[styles.navLabel, { color: isDark ? '#4b5563' : '#9ca3af' }]}>NAVEGACIÓN</Text>

      {/* Nav items */}
      {TABS.map(tab => {
        const isActive = pathname.includes(tab.name);
        return (
          <TouchableOpacity
            key={tab.name}
            style={[
              styles.sidebarItem,
              isActive && { backgroundColor: colors.primary + '18', borderLeftColor: colors.primary },
              !isActive && { borderLeftColor: 'transparent' },
            ]}
            onPress={() => router.push('/(tabs)/' + tab.name)}
          >
            <View style={[styles.iconWrap, isActive && { backgroundColor: colors.primary + '25' }]}>
              <Ionicons
                name={isActive ? tab.icon as any : tab.iconOut as any}
                size={18}
                color={isActive ? colors.primary : isDark ? '#6b7280' : '#9ca3af'}
              />
            </View>
            <Text style={[
              styles.sidebarLabel,
              { color: isActive ? colors.primary : isDark ? '#9ca3af' : '#6b7280' },
              isActive && { fontWeight: '700' },
            ]}>
              {tab.title}
            </Text>
            {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        );
      })}

      {/* Footer */}
      <View style={[styles.sidebarFooter, { borderTopColor: isDark ? '#1e2130' : '#e8ecf0' }]}>
        <TouchableOpacity
          style={[styles.themeToggle, { backgroundColor: isDark ? '#1e2130' : '#f3f4f6' }]}
          onPress={toggleTheme}
        >
          <Text style={styles.themeToggleEmoji}>{isDark ? '☀️' : '🌙'}</Text>
          <Text style={[styles.themeToggleText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            {isDark ? 'Modo Claro' : 'Modo Oscuro'}
          </Text>
          <View style={[styles.themeToggleSwitch, { backgroundColor: isDark ? colors.primary : '#d1d5db' }]}>
            <View style={[styles.themeToggleThumb, { marginLeft: isDark ? 14 : 2 }]} />
          </View>
        </TouchableOpacity>
        {user && (
          <View style={[styles.userInfo, { borderTopColor: isDark ? '#1e2130' : '#e8ecf0', borderBottomColor: isDark ? '#1e2130' : '#e8ecf0' }]}>
            <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.userAvatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: isDark ? '#fff' : '#0f1117' }]} numberOfLines={1}>{user.name}</Text>
              <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>{user.email}</Text>
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: isDark ? '#1e2130' : '#f3f4f6' }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={16} color="#FF3B30" />
          <Text style={[styles.logoutText]}>Cerrar sesión</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: isDark ? '#4b5563' : '#d1d5db' }]}>
          Powered by Yahoo Finance
        </Text>
        <Text style={[styles.footerVersion, { color: isDark ? '#374151' : '#e5e7eb' }]}>v2.0.0</Text>
      </View>
    </View>
  );
}

function WebTopBar({ colors, isDark }: { colors: any; isDark: boolean }) {
  const pathname = usePathname();
  const currentTab = TABS.find(t => pathname.includes(t.name));

  return (
    <View style={[styles.topBar, {
      backgroundColor: isDark ? '#0f1117' : '#ffffff',
      borderBottomColor: isDark ? '#1e2130' : '#e8ecf0',
    }]}>
      <View style={styles.topBarLeft}>
        <Text style={styles.topBarEmoji}>{currentTab?.emoji || '📊'}</Text>
        <Text style={[styles.topBarTitle, { color: isDark ? '#ffffff' : '#0f1117' }]}>
          {currentTab?.title || 'FinAnalysis'}
        </Text>
      </View>
      <View style={[styles.topBarBadge, { backgroundColor: colors.primary + '18' }]}>
        <View style={[styles.liveDot, { backgroundColor: '#22c55e' }]} />
        <Text style={[styles.topBarBadgeText, { color: colors.primary }]}>Mercado activo</Text>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return (
      <View style={[styles.webContainer, { backgroundColor: isDark ? '#080b12' : '#f3f4f6' }]}>
        <WebSidebar />
        <View style={styles.mainArea}>
          <WebTopBar colors={colors} isDark={isDark} />
          <View style={styles.webContent}>
            <Tabs
              screenOptions={{
                tabBarStyle: { display: 'none' },
                headerShown: false,
              }}
            >
              {TABS.map(tab => (
                <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
              ))}
            </Tabs>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.icon as any : tab.iconOut as any} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100vh' as any,
  },
  sidebar: {
    width: 240,
    minHeight: '100vh' as any,
    borderRightWidth: 1,
    flexDirection: 'column',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  logoSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 4,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 10,
    borderLeftWidth: 3,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sidebarFooter: {
    marginTop: 'auto' as any,
    padding: 20,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
  footerVersion: {
    fontSize: 10,
    marginTop: 2,
  },
  mainArea: {
    flex: 1,
    flexDirection: 'column',
    minHeight: '100vh' as any,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarEmoji: {
    fontSize: 20,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  topBarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  topBarBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  webContent: {
    flex: 1,
    overflow: 'auto' as any,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 11,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    gap: 8,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FF3B30',
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  themeToggleEmoji: {
    fontSize: 16,
  },
  themeToggleText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  themeToggleSwitch: {
    width: 32,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
  },
  themeToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
  },
});
