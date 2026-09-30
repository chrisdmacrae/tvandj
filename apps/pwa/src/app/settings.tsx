import type { SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Dropdown, SelectChip, Text, spacing, useLayout } from '@tv-and-j/design-system';
import { isRestricted, ratingLimitLabel, useCurrentUser, useParentalRatings, useUpdateUserConfiguration } from '@tv-and-j/core/jellyfin/users';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';
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
