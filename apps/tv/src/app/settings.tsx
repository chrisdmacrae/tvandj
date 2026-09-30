import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import {
  ArrowLeftIcon,
  Button,
  Dropdown,
  IconButton,
  SelectChip,
  Text,
  TextField,
  colors,
  safeArea,
  spacing,
} from '@tv-and-j/design-system';
import type { SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models';
import { PinSetup } from '../components/PinSetup';
import { Downloadarr, findDownloadarr, normalizeBaseUrl } from '@tv-and-j/core/downloadarr/client';
import { isRestricted, ratingLimitLabel, useCurrentUser, useParentalRatings, useUpdateUserConfiguration } from '@tv-and-j/core/jellyfin/users';
import { hasPin } from '@tv-and-j/core/state/profilePins';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings, type Settings } from '@tv-and-j/core/state/SettingsContext';
import { CODECS, LANGUAGES, QUALITIES } from '@tv-and-j/core/downloadarr/requestOptions';

/** Jellyfin's language codes (ISO 639-2). Empty means no preference: the file's default. */
const TRACK_LANGUAGES = [
  { value: '', label: 'No preference' },
  { value: 'eng', label: 'English' },
  { value: 'fre', label: 'French' },
  { value: 'ger', label: 'German' },
  { value: 'spa', label: 'Spanish' },
  { value: 'ita', label: 'Italian' },
  { value: 'por', label: 'Portuguese' },
  { value: 'dut', label: 'Dutch' },
  { value: 'swe', label: 'Swedish' },
  { value: 'jpn', label: 'Japanese' },
  { value: 'kor', label: 'Korean' },
  { value: 'chi', label: 'Chinese' },
  { value: 'hin', label: 'Hindi' },
];

const SUBTITLE_MODES: { value: SubtitlePlaybackMode; label: string }[] = [
  { value: 'Default', label: 'When the file says to' },
  { value: 'Smart', label: 'When the audio isn’t my language' },
  { value: 'OnlyForced', label: 'Only for foreign dialogue' },
  { value: 'Always', label: 'Always' },
  { value: 'None', label: 'Never' },
];

const SCREENSAVER_DELAYS = [
  { value: 0, label: 'Off' },
  // For checking the screensaver without waiting.
  { value: 0.5, label: 'After 30 seconds' },
  { value: 3, label: 'After 3 minutes' },
  { value: 5, label: 'After 5 minutes' },
  { value: 10, label: 'After 10 minutes' },
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
  const { settings, update, householdAccess, downloadarrFromHousehold } = useSettings();
  // Set for the household by an administrator: others see it but can't change it.
  const householdLocked = householdAccess === 'read' && downloadarrFromHousehold;
  const [address, setAddress] = useState(settings.downloadarrUrl ?? '');
  useEffect(() => {
    setAddress(settings.downloadarrUrl ?? '');
  }, [settings.downloadarrUrl]);
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'found' | 'ok' | 'error'; message?: string }>({ state: 'idle' });

  const setRequest = (patch: Partial<Settings['request']>) => update({ request: { ...settings.request, ...patch } });

  // This profile in Jellyfin: its content limits and language preferences.
  const user = useCurrentUser().data;
  const ratings = useParentalRatings().data;
  const restricted = isRestricted(user?.Policy);
  const limit = ratingLimitLabel(user?.Policy, ratings);
  const config = user?.Configuration;
  const updateConfig = useUpdateUserConfiguration();

  // This profile's PIN on this TV.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [pinDialog, setPinDialog] = useState<'set' | 'remove' | null>(null);
  useEffect(() => {
    hasPin(auth.userId).then(setPinned);
  }, [auth.userId]);

  // Not set up yet: look for downloadarr next to Jellyfin and pre-fill it if it answers.
  useEffect(() => {
    if (settings.downloadarrUrl || restricted) return;
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
  }, [settings.downloadarrUrl, server.address, restricted]);

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
              {/* Changing server forgets every profile on this TV: not for profiles with content limits. */}
              {restricted ? null : <Button label="Change server" variant="secondary" size="sm" onPress={forgetServer} />}
            </View>
          </Section>

          <Section
            title="Profile"
            description={
              limit
                ? `${limit}, set in Jellyfin. Discovery and requests are turned off for this profile, since they can’t be filtered by rating.`
                : 'A PIN stops others on this TV switching into your profile.'
            }
          >
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {pinned ? (
                <>
                  <Button label="Change PIN" variant="secondary" size="sm" onPress={() => setPinDialog('set')} />
                  <Button label="Remove PIN" variant="ghost" size="sm" onPress={() => setPinDialog('remove')} />
                </>
              ) : pinned === false ? (
                <Button label="Set a PIN" variant="secondary" size="sm" onPress={() => setPinDialog('set')} />
              ) : null}
            </View>
          </Section>

          <Section title="Languages" description="Saved to your Jellyfin account, so your other Jellyfin apps use them too.">
            {config ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Dropdown
                  label="Audio"
                  value={config.AudioLanguagePreference ?? ''}
                  options={TRACK_LANGUAGES}
                  onChange={(v) => updateConfig.mutate({ AudioLanguagePreference: v || null })}
                />
                <Dropdown
                  label="Subtitles"
                  value={config.SubtitleLanguagePreference ?? ''}
                  options={TRACK_LANGUAGES}
                  onChange={(v) => updateConfig.mutate({ SubtitleLanguagePreference: v || null })}
                />
                <Dropdown
                  label="Show subtitles"
                  value={config.SubtitleMode ?? 'Default'}
                  options={SUBTITLE_MODES}
                  onChange={(v) => updateConfig.mutate({ SubtitleMode: v })}
                />
              </View>
            ) : null}
            {updateConfig.isError ? (
              <Text variant="caption" style={{ color: colors.danger }}>
                Couldn’t save to Jellyfin. Try again.
              </Text>
            ) : null}
          </Section>

          <Section title="Screensaver" description="Library backdrops and the time, after a while with nothing pressed on the browse screens. Any button comes back.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {SCREENSAVER_DELAYS.map((d) => (
                <SelectChip
                  key={d.value}
                  label={d.label}
                  selected={settings.screensaverMinutes === d.value}
                  onPress={() => update({ screensaverMinutes: d.value })}
                />
              ))}
            </View>
          </Section>

          <Section title="Playback" description="Synced with your Jellyfin account, so your other devices use them too (trailers are just for this TV).">
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
              <SelectChip
                label="Play theme music on show pages"
                selected={settings.playback.themeMusic}
                onPress={() => update({ playback: { ...settings.playback, themeMusic: !settings.playback.themeMusic } })}
              />
              {settings.downloadarrUrl && !restricted ? (
                <SelectChip
                  label="Play trailers on request pages"
                  selected={settings.playback.trailers}
                  onPress={() => update({ playback: { ...settings.playback, trailers: !settings.playback.trailers } })}
                />
              ) : null}
            </View>
          </Section>

          {/* The downloadarr connection is the TV's, so profiles with content limits can't change it. */}
          {restricted ? null : (
            <>
              <Section
                title="downloadarr"
                description={`Optional. Connect downloadarr to discover new movies and shows, request them, and follow their downloads. ${
                  householdAccess === 'write'
                    ? 'Shared with everyone in your household, on every device.'
                    : householdLocked
                      ? 'Set for your household by an administrator.'
                      : householdAccess === 'read'
                        ? 'Just for this TV (an administrator can set it for the whole household).'
                        : 'Just for this TV. Install the TV and J plugin on your Jellyfin server to share it with every device.'
                }`}
              >
                {householdLocked ? (
                  <Text tone="secondary">{settings.downloadarrUrl ?? 'Not connected'}</Text>
                ) : (
                <>
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
                </>
                )}
              </Section>

              {settings.downloadarrUrl ? (
                <Section title="Requests" description="What downloadarr looks for when you request something. Releases that don’t match are skipped. Synced with your Jellyfin account.">
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
            </>
          )}
        </View>
      </ScrollView>

      {pinDialog ? (
        <PinSetup
          userId={auth.userId}
          hasPin={!!pinned}
          remove={pinDialog === 'remove'}
          onDone={(changed) => {
            setPinDialog(null);
            if (changed) hasPin(auth.userId).then(setPinned);
          }}
        />
      ) : null}
    </View>
  );
}
