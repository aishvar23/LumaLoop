/**
 * People search for React Native (accounts pivot, Phase 2/3) — the RN counterpart
 * of web `src/social/PeopleSearchPage.tsx`. Find other users to follow.
 *
 * Debounced search over `public.profiles`; each result row opens the user's
 * profile (`onOpenUser`) and carries a {@link FollowButton}. Provides the
 * {@link SocialConfigProvider} so follow buttons get the client + viewer id.
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from './auth/AuthProvider';
import type { AuthClient } from './auth/authClient';
import { supabase } from './auth/supabaseClient';
import FollowButton from './social/FollowButton';
import { SocialConfigProvider } from './social/SocialContext';
import { searchProfiles, type ProfileLite } from './social/userDiscoveryApi';
import {
  colors,
  fontSize,
  fontWeight,
  PAGE_BACKGROUND,
  radius,
  space,
} from './feed/templates/tokens';

export interface PeopleSearchScreenProps {
  onBack: () => void;
  onOpenUser: (userId: string) => void;
  client?: AuthClient;
  search?: typeof searchProfiles;
  debounceMs?: number;
}

export default function PeopleSearchScreen({
  onBack,
  onOpenUser,
  client: clientProp,
  search = searchProfiles,
  debounceMs = 250,
}: PeopleSearchScreenProps) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const client = clientProp ?? auth.client ?? supabase;
  const userId = auth.user?.id ?? null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    let active = true;
    const id = setTimeout(() => {
      void (async () => {
        const res = await search(client, q, { excludeUserId: userId });
        if (active) {
          setResults(res);
          setSearched(true);
        }
      })();
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, client, userId, search, debounceMs]);

  return (
    <SocialConfigProvider value={{ client, userId }}>
      <View style={[styles.page, { paddingTop: Math.max(insets.top, 48) + space.md }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" testID="search-back" onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>‹ Home</Text>
          </Pressable>
          <Text style={styles.title}>Find people</Text>
        </View>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or @handle"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          testID="people-search-input"
        />
        <ScrollView keyboardShouldPersistTaps="handled">
          {results.map((p) => (
            <View key={p.id} style={styles.row}>
              <Pressable
                style={styles.rowMain}
                accessibilityRole="button"
                accessibilityLabel={`${p.displayName} @${p.handle}`}
                testID={`people-row-${p.id}`}
                onPress={() => onOpenUser(p.id)}
              >
                <View style={styles.avatar}>
                  {p.avatarUrl ? (
                    <Image source={{ uri: p.avatarUrl }} style={styles.avatarImg} accessibilityIgnoresInvertColors />
                  ) : (
                    <Text style={styles.avatarText}>{(p.displayName[0] ?? '?').toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.id}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  <Text style={styles.handle}>@{p.handle}</Text>
                </View>
              </Pressable>
              <FollowButton targetUserId={p.id} />
            </View>
          ))}
          {searched && results.length === 0 ? (
            <Text style={styles.empty}>No one found.</Text>
          ) : null}
        </ScrollView>
      </View>
    </SocialConfigProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE_BACKGROUND, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { color: colors.accent, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.avatar,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: colors.accentContrast, fontWeight: fontWeight.bold },
  id: { flex: 1 },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  handle: { color: colors.textMuted, fontSize: fontSize.sm },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
});
