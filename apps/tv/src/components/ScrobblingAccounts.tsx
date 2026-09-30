import { useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, SelectChip, Text, TextField, colors, spacing } from '@tv-and-j/design-system';
import {
  useConnectLastfm,
  useConnectListenBrainz,
  useDisconnectScrobbler,
  useScrobbling,
  useTraktSignIn,
  useWatchlistSync,
  type ScrobbleService,
  type ScrobbleServiceState,
} from '@tv-and-j/core/jellyfin/scrobbling';

const SETUP_HINT: Record<'lastfm' | 'trakt', string> = {
  lastfm: 'Not set up on this server yet: an administrator adds a Last.fm API key in Jellyfin, under Dashboard → Plugins → TV and J.',
  trakt: 'Not set up on this server yet: an administrator adds a Trakt app in Jellyfin, under Dashboard → Plugins → TV and J.',
};

/**
 * Settings → Scrobbling: this person's Last.fm, ListenBrainz and Trakt accounts. The Jellyfin
 * server does the scrobbling (TV and J plugin 1.1+), for everything they play in any Jellyfin app.
 */
export function ScrobblingAccounts() {
  const status = useScrobbling();
  if (status.isPending) return <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} />;
  if (!status.data) {
    return (
      <Text tone="secondary">
        Install the TV and J plugin (1.1 or newer) on your Jellyfin server to scrobble what you play to Last.fm, ListenBrainz and Trakt.
      </Text>
    );
  }
  const s = status.data;
  return (
    <View style={{ gap: spacing.xl }}>
      <Service name="Last.fm" what="The music you play." service="lastfm" state={s.lastfm}>
        {s.lastfm.available ? <LastfmSignIn /> : <Text variant="caption" tone="tertiary">{SETUP_HINT.lastfm}</Text>}
      </Service>
      <Service name="ListenBrainz" what="The music you play. If downloadarr reads this ListenBrainz account, it recommends from it too." service="listenbrainz" state={s.listenbrainz}>
        <ListenBrainzSignIn />
      </Service>
      <Service name="Trakt" what="Movies and shows you watch." service="trakt" state={s.trakt} extra={<WatchlistToggle on={s.traktWatchlistSync} />}>
        {s.trakt.available ? <TraktSignInButton /> : <Text variant="caption" tone="tertiary">{SETUP_HINT.trakt}</Text>}
      </Service>
    </View>
  );
}

/** One service: connected as someone (with Disconnect), or the way to connect it. */
function Service({
  name,
  what,
  service,
  state,
  extra,
  children,
}: {
  name: string;
  what: string;
  service: ScrobbleService;
  state: ScrobbleServiceState;
  /** More settings for once it's connected. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const disconnect = useDisconnectScrobbler();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text variant="label">{name}</Text>
        <Text variant="caption" tone="secondary">
          {state.connected ? `Scrobbling as ${state.username ?? 'you'}. ${what}` : what}
        </Text>
      </View>
      {state.connected ? extra : null}
      {state.connected ? (
        <View style={{ flexDirection: 'row' }}>
          <Button label={disconnect.isPending ? 'Disconnecting…' : 'Disconnect'} size="sm" variant="ghost" onPress={() => disconnect.mutate(service)} />
        </View>
      ) : (
        children
      )}
    </View>
  );
}

function Failure({ message }: { message?: string }) {
  return message ? (
    <Text variant="caption" style={{ color: colors.danger }}>
      {message}
    </Text>
  ) : null;
}

function LastfmSignIn() {
  const connect = useConnectLastfm();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = () => username.trim() && password && connect.mutate({ username, password }, { onSuccess: () => setPassword('') });
  return (
    <View style={{ gap: spacing.sm, maxWidth: 520 }}>
      <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        onSubmitEditing={submit}
        hint="Sent to Last.fm once to sign in; your server keeps only the sign-in, not the password."
      />
      <Failure message={connect.error?.message} />
      <View style={{ flexDirection: 'row' }}>
        <Button label={connect.isPending ? 'Connecting…' : 'Connect Last.fm'} size="sm" disabled={connect.isPending} onPress={submit} />
      </View>
    </View>
  );
}

function ListenBrainzSignIn() {
  const connect = useConnectListenBrainz();
  const [token, setToken] = useState('');
  const submit = () => token.trim() && connect.mutate(token, { onSuccess: () => setToken('') });
  return (
    <View style={{ gap: spacing.sm, maxWidth: 520 }}>
      <TextField
        label="User token"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={submit}
        hint="From listenbrainz.org/settings."
      />
      <Failure message={connect.error?.message} />
      <View style={{ flexDirection: 'row' }}>
        <Button label={connect.isPending ? 'Connecting…' : 'Connect ListenBrainz'} size="sm" disabled={connect.isPending} onPress={submit} />
      </View>
    </View>
  );
}

/** Trakt signs in with a code entered on another device: nothing to type with the remote. */
function TraktSignInButton() {
  const { signIn, start, cancel } = useTraktSignIn();
  if (signIn.state === 'waiting') {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text tone="secondary">On your phone or computer, go to {signIn.url.replace(/^https?:\/\//, '')} and enter</Text>
        <Text variant="headline" style={{ letterSpacing: 4 }}>
          {signIn.code}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="caption" tone="secondary">
            Waiting for Trakt…
          </Text>
          <Button label="Cancel" size="sm" variant="ghost" hasTVPreferredFocus onPress={cancel} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <Failure message={signIn.state === 'failed' ? signIn.message : undefined} />
      <View style={{ flexDirection: 'row' }}>
        <Button label={signIn.state === 'starting' ? 'Starting…' : 'Connect Trakt'} size="sm" disabled={signIn.state === 'starting'} onPress={start} />
      </View>
    </View>
  );
}

/** One way, Jellyfin to Trakt: unwatched movies and shows on My List go on the Trakt watchlist. */
function WatchlistToggle({ on }: { on: boolean }) {
  const sync = useWatchlistSync();
  const note = sync.isPending
    ? on
      ? 'Turning off…'
      : 'Adding My List to your watchlist…'
    : sync.error
      ? sync.error.message
      : sync.data?.status.traktWatchlistSync
        ? `Added ${sync.data.added} title${sync.data.added === 1 ? '' : 's'} to your Trakt watchlist. From now on, My List keeps it up to date.`
        : 'Unwatched movies and shows on My List go on your Trakt watchlist, and come off it when you remove them or finish watching.';
  return (
    <View style={{ gap: spacing.xs, alignItems: 'flex-start' }}>
      <SelectChip label="Add My List to my Trakt watchlist" selected={on} onPress={() => !sync.isPending && sync.mutate(!on)} />
      <Text variant="caption" tone="secondary" style={sync.error ? { color: colors.danger } : undefined}>
        {note}
      </Text>
    </View>
  );
}
