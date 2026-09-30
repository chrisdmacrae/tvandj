import type { SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Dropdown, SelectChip, Text, TextField, spacing, useLayout } from '@tv-and-j/design-system';
import { Downloadarr, findDownloadarr, normalizeBaseUrl } from '@tv-and-j/core/downloadarr/client';
import { CODECS, LANGUAGES, QUALITIES, downloadarrAddress } from '@tv-and-j/core/downloadarr/requestOptions';
import { isRestricted, ratingLimitLabel, useCurrentUser, useParentalRatings, useUpdateUserConfiguration } from '@tv-and-j/core/jellyfin/users';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings, type Settings as AppSettings } from '@tv-and-j/core/state/SettingsContext';
import { Page } from '../components/Page';

const TRACK_LANGUAGES = [
  { value: '', label: 'No preference' },
  { value: 'eng', label: 'English' },
  { value: 'fre', label: 'French' },
  { value: 'ger', label: 'German' },
  { value: 'spa', label: 'Spanish' },
  { value: 'ita', label: 'Italian' },
  { value: 'por', label: 'Portuguese' },
  { value: 'jpn', label: 'Japanese' },
  { value: 'kor', label: 'Korean' },
];

const SUBTITLE_MODES: { value: SubtitlePlaybackMode; label: string }[] = [
  { value: 'Default', label: 'When the file says to' },
  { value: 'Smart', label: 'When the audio isn’t my language' },
  { value: 'OnlyForced', label: 'Only for foreign dialogue' },
  { value: 'Always', label: 'Always' },
  { value: 'None', label: 'Never' },
];

/** Running as an installed app (home screen) rather than in a browser tab. */
const installed =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Multi-select that always keeps at least one option on. */
function Choices<T extends string>({ options, selected, onChange }: { options: { value: T; label: string }[]; selected: T[]; onChange: (next: T[]) => void }) {
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

/** An https page can't talk to an http server: browsers block it. */
const servedSecurely = typeof location !== 'undefined' && location.protocol === 'https:';

/**
 * Where downloadarr is. With the TV and J plugin on the Jellyfin server, an
 * administrator sets it once for the whole household; otherwise it's just this device.
 */
function DownloadarrSection() {
  const { server } = useAuthedSession();
  const { settings, update, householdAccess, downloadarrFromHousehold } = useSettings();
  const locked = householdAccess === 'read' && downloadarrFromHousehold;
  const [address, setAddress] = useState(settings.downloadarrUrl ?? '');
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setAddress(settings.downloadarrUrl ?? ''), [settings.downloadarrUrl]);

  // Not set up yet: look for downloadarr next to Jellyfin, and pre-fill it if it answers.
  useEffect(() => {
    if (settings.downloadarrUrl || locked) return;
    let cancelled = false;
    findDownloadarr(server.address).then((found) => {
      if (cancelled || !found) return;
      setAddress(found);
      setMessage({ text: 'Found downloadarr next to your Jellyfin server. Press Connect to use it.' });
    });
    return () => {
      cancelled = true;
    };
  }, [settings.downloadarrUrl, locked, server.address]);

  const connect = async () => {
    if (!address.trim()) return setMessage({ error: true, text: 'Enter downloadarr’s address.' });
    const url = downloadarrAddress(address, normalizeBaseUrl);
    if (servedSecurely && url.startsWith('http://')) {
      return setMessage({ error: true, text: 'This page is secure (https), so browsers won’t let it reach an http address. Use downloadarr’s https address.' });
    }
    setBusy(true);
    setMessage(undefined);
    try {
      await new Downloadarr(url).ping();
      await update({ downloadarrUrl: url });
      setMessage({ text: 'Connected.' });
    } catch {
      setMessage({
        error: true,
        text: 'Couldn’t reach downloadarr there. Use its API address (usually port 3001), and make sure downloadarr allows this app’s address (FRONTEND_URL).',
      });
    } finally {
      setBusy(false);
    }
  };

  const scope =
    householdAccess === 'write'
      ? 'Shared with everyone in your household, on every device.'
      : locked
        ? 'Set for your household by an administrator.'
        : householdAccess === 'read'
          ? 'Just for this device (an administrator can set it for the whole household).'
          : 'Just for this device. Install the TV and J plugin on your Jellyfin server to share it with every device.';

  return (
    <Section title="downloadarr" description={`Optional. Discover new movies and shows, request them, and follow their downloads. ${scope}`}>
      {locked ? (
        <Text tone="secondary">{settings.downloadarrUrl}</Text>
      ) : (
        <>
          <TextField
            label="Address"
            placeholder={servedSecurely ? 'https://downloadarr.example.com' : '192.168.1.20:3001'}
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setMessage(undefined);
            }}
            onSubmitEditing={connect}
            error={message?.error ? message.text : undefined}
            hint={!message?.error ? (message?.text ?? (settings.downloadarrUrl ? `Connected to ${settings.downloadarrUrl}` : undefined)) : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={busy ? 'Checking…' : 'Connect'} size="sm" disabled={busy} onPress={connect} />
            {settings.downloadarrUrl ? (
              <Button
                label="Disconnect"
                size="sm"
                variant="ghost"
                onPress={() => {
                  update({ downloadarrUrl: null });
                  setAddress('');
                  setMessage(undefined);
                }}
              />
            ) : null}
          </View>
        </>
      )}
    </Section>
  );
}

function RequestsSection() {
  const { settings, update } = useSettings();
  const set = (patch: Partial<AppSettings['request']>) => update({ request: { ...settings.request, ...patch } });
  return (
    <Section title="Requests" description="What downloadarr looks for when you request something. Releases that don’t match are skipped. Synced with your Jellyfin account.">
      <Text variant="label" tone="secondary">
        Quality
      </Text>
      <Choices options={QUALITIES} selected={settings.request.qualities} onChange={(qualities) => set({ qualities })} />
      <Text variant="label" tone="secondary">
        Video format
      </Text>
      <Choices options={CODECS} selected={settings.request.codecs} onChange={(codecs) => set({ codecs })} />
      <Text variant="label" tone="secondary">
        Language
      </Text>
      <Choices options={LANGUAGES} selected={settings.request.languages} onChange={(languages) => set({ languages })} />
    </Section>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
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

export default function Settings() {
  const { auth, server, signOut, forgetServer } = useAuthedSession();
  const { gutter } = useLayout();
  const user = useCurrentUser().data;
  const limit = ratingLimitLabel(user?.Policy, useParentalRatings().data);
  const config = user?.Configuration;
  const updateConfig = useUpdateUserConfiguration();
  const { settings, update } = useSettings();

  return (
    <Page back title="Settings">
      <View style={{ paddingHorizontal: gutter, maxWidth: 640 + gutter * 2 }}>
        <Section title="Account" description={`${auth.userName} on ${server.name} (${server.address})${limit ? ` · ${limit}` : ''}`}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button label="Switch profile" size="sm" variant="secondary" onPress={() => router.push('/profiles')} />
            <Button label="Sign out" size="sm" variant="secondary" onPress={signOut} />
            {isRestricted(user?.Policy) ? null : <Button label="Change server" size="sm" variant="ghost" onPress={forgetServer} />}
          </View>
        </Section>

        <Section title="Languages" description="Saved to your Jellyfin account, so your other Jellyfin apps (and the TV) use them too.">
          {config ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Dropdown label="Audio" value={config.AudioLanguagePreference ?? ''} options={TRACK_LANGUAGES} onChange={(v) => updateConfig.mutate({ AudioLanguagePreference: v || null })} />
              <Dropdown label="Subtitles" value={config.SubtitleLanguagePreference ?? ''} options={TRACK_LANGUAGES} onChange={(v) => updateConfig.mutate({ SubtitleLanguagePreference: v || null })} />
              <Dropdown label="Show subtitles" value={config.SubtitleMode ?? 'Default'} options={SUBTITLE_MODES} onChange={(v) => updateConfig.mutate({ SubtitleMode: v })} />
            </View>
          ) : null}
        </Section>

        <Section title="Playback" description="Synced with your Jellyfin account, so it's the same on the TV.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <SelectChip
              label="Play the next episode automatically"
              selected={settings.playback.autoplayNext}
              onPress={() => update({ playback: { ...settings.playback, autoplayNext: !settings.playback.autoplayNext } })}
            />
          </View>
        </Section>

        {/* downloadarr: not for profiles with content limits (its catalogue can't be filtered by rating). */}
        {isRestricted(user?.Policy) ? null : (
          <>
            <DownloadarrSection />
            {settings.downloadarrUrl ? <RequestsSection /> : null}
          </>
        )}

        {installed ? null : (
          <Section
            title="Install"
            description={
              isIos
                ? 'Add TV and J to your home screen: tap Share, then “Add to Home Screen”. It opens full screen, like an app.'
                : 'Install TV and J from your browser’s menu (“Install app” or “Add to Home screen”). It opens in its own window, like an app.'
            }
          />
        )}
      </View>
    </Page>
  );
}
