import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  ArrowLeftIcon,
  Button,
  IconButton,
  SelectChip,
  Text,
  TextField,
  colors,
  safeArea,
  spacing,
} from '@tv-and-j/design-system';
import { Downloadarr, findDownloadarr, normalizeBaseUrl } from '../downloadarr/client';
import { useAuthedSession } from '../state/SessionContext';
import { useSettings, type Codec, type Language, type Quality, type Settings } from '../state/SettingsContext';

const QUALITIES: { value: Quality; label: string }[] = [
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
];
const CODECS: { value: Codec; label: string }[] = [
  { value: 'h264', label: 'H.264' },
  { value: 'hevc', label: 'HEVC (H.265)' },
];
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'japanese', label: 'Japanese' },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.md, marginBottom: spacing.xxl }}>
      <View style={{ gap: spacing.xxs }}>
        <Text variant="title">{title}</Text>
        {description ? (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Multi-select that always keeps at least one option on. */
function Choices<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <SelectChip
            key={o.value}
            label={o.label}
            selected={on}
            onPress={() => {
              const next = on ? selected.filter((v) => v !== o.value) : [...selected, o.value];
              if (next.length) onChange(next);
            }}
          />
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const { server, auth, signOut, forgetServer } = useAuthedSession();
  const { settings, update } = useSettings();
  const [address, setAddress] = useState(settings.downloadarrUrl ?? '');
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'found' | 'ok' | 'error'; message?: string }>({ state: 'idle' });

  const setRequest = (patch: Partial<Settings['request']>) => update({ request: { ...settings.request, ...patch } });

  // Not set up yet: look for downloadarr next to Jellyfin and pre-fill it if it answers.
  useEffect(() => {
    if (settings.downloadarrUrl) return;
    let cancelled = false;
    setCheck({ state: 'checking', message: 'Looking for downloadarr on your network…' });
    findDownloadarr(server.address).then((found) => {
      if (cancelled) return;
      if (found) {
        setAddress(found);
        setCheck({ state: 'found', message: 'Found downloadarr on your network. Press Connect to use it.' });
      } else {
        setCheck({ state: 'idle' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.downloadarrUrl, server.address]);

  const connect = async () => {
    if (!address.trim()) return setCheck({ state: 'error', message: 'Enter downloadarr’s address.' });
    const url = /^https?:\/\/.+(:\d+|\/api)$/.test(address.trim()) ? address.trim() : normalizeBaseUrl(address);
    setCheck({ state: 'checking' });
    try {
      await new Downloadarr(url).ping();
      await update({ downloadarrUrl: url });
      setAddress(url);
      setCheck({ state: 'ok', message: 'Connected.' });
    } catch {
      setCheck({
        state: 'error',
        message: 'Couldn’t reach downloadarr there. Use its API address, usually port 3001, e.g. 192.168.1.20:3001.',
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.lg,
          paddingHorizontal: safeArea.horizontal,
          paddingTop: safeArea.vertical,
          paddingBottom: spacing.lg,
        }}
      >
        <IconButton
          accessibilityLabel="Back"
          icon={(color) => <ArrowLeftIcon color={color} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Text variant="headline">Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: safeArea.horizontal, paddingBottom: safeArea.vertical }}>
        <View style={{ maxWidth: 560 }}>
          <Section title="Jellyfin" description={`Signed in as ${auth.userName} on ${server.name} (${server.address})`}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Sign out" variant="secondary" size="sm" hasTVPreferredFocus onPress={signOut} />
              <Button label="Change server" variant="secondary" size="sm" onPress={forgetServer} />
            </View>
          </Section>

          <Section title="Playback">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <SelectChip
                label="Skip intros and recaps automatically"
                selected={settings.playback.autoSkipIntro}
                onPress={() => update({ playback: { ...settings.playback, autoSkipIntro: !settings.playback.autoSkipIntro } })}
              />
              <SelectChip
                label="Play the next episode automatically"
                selected={settings.playback.autoplayNext}
                onPress={() => update({ playback: { ...settings.playback, autoplayNext: !settings.playback.autoplayNext } })}
              />
            </View>
          </Section>

          <Section
            title="downloadarr"
            description="Optional. Connect downloadarr to discover new movies and shows, request them, and follow their downloads."
          >
            <TextField
              label="Address"
              placeholder="192.168.1.20:3001"
              value={address}
              onChangeText={(text) => {
                setAddress(text);
                setCheck({ state: 'idle' });
              }}
              onSubmitEditing={connect}
              error={check.state === 'error' ? check.message : undefined}
              hint={
                check.state === 'ok' || check.state === 'found' || (check.state === 'checking' && check.message)
                  ? check.message
                  : settings.downloadarrUrl
                    ? `Connected to ${settings.downloadarrUrl}`
                    : undefined
              }
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label={check.state === 'checking' && !check.message ? 'Checking…' : 'Connect'}
                size="sm"
                onPress={connect}
              />
              {settings.downloadarrUrl ? (
                <Button
                  label="Disconnect"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    update({ downloadarrUrl: null });
                    setAddress('');
                    setCheck({ state: 'idle' });
                  }}
                />
              ) : null}
            </View>
          </Section>

          {settings.downloadarrUrl ? (
            <Section title="Requests" description="What downloadarr looks for when you request something. Releases that don’t match are skipped.">
              <Text variant="label" tone="secondary">
                Quality
              </Text>
              <Choices options={QUALITIES} selected={settings.request.qualities} onChange={(qualities) => setRequest({ qualities })} />
              <Text variant="label" tone="secondary">
                Video format
              </Text>
              <Choices options={CODECS} selected={settings.request.codecs} onChange={(codecs) => setRequest({ codecs })} />
              <Text variant="label" tone="secondary">
                Language
              </Text>
              <Choices options={LANGUAGES} selected={settings.request.languages} onChange={(languages) => setRequest({ languages })} />
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
