import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, TextField, spacing } from '@tv-and-j/design-system';
import { Downloadarr, findDownloadarr, normalizeBaseUrl } from '@tv-and-j/core/downloadarr/client';
import { downloadarrAddress } from '@tv-and-j/core/downloadarr/requestOptions';
import { useAuthedSession } from '@tv-and-j/core/state/SessionContext';
import { useSettings } from '@tv-and-j/core/state/SettingsContext';

/** An https page can't talk to an http server: browsers block it. */
const servedSecurely = typeof location !== 'undefined' && location.protocol === 'https:';

/**
 * downloadarr's address: looked for next to Jellyfin when it isn't set,
 * checked before it's saved. Used by Settings and onboarding.
 */
export function DownloadarrAddress() {
  const { server } = useAuthedSession();
  const { settings, update } = useSettings();
  const [address, setAddress] = useState(settings.downloadarrUrl ?? '');
  const [message, setMessage] = useState<{ error?: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => setAddress(settings.downloadarrUrl ?? ''), [settings.downloadarrUrl]);

  // Not set up yet: look for downloadarr next to Jellyfin, and pre-fill it if it answers.
  useEffect(() => {
    if (settings.downloadarrUrl) return;
    let cancelled = false;
    findDownloadarr(server.address).then((found) => {
      if (cancelled || !found) return;
      setAddress(found);
      setMessage({ text: 'Found downloadarr next to your Jellyfin server. Press Connect to use it.' });
    });
    return () => {
      cancelled = true;
    };
  }, [settings.downloadarrUrl, server.address]);

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
      // Connected counts as answering onboarding's question.
      await update({ downloadarrUrl: url, downloadarrAsked: true });
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

  return (
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
  );
}
