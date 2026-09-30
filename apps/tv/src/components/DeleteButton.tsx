import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Button, IconButton, Text, TrashIcon, colors, radii, spacing } from '@tv-and-j/design-system';
import { useAuthedSession } from '../state/SessionContext';

const WHAT: Record<string, string> = {
  Movie: 'this movie',
  Series: 'this show and every episode in it',
  Season: 'this season and every episode in it',
  Episode: 'this episode',
  MusicAlbum: 'this album and all its songs',
  Audio: 'this song',
};

type DeleteButtonProps = {
  item: BaseItemDto | undefined;
  /** Called after it's gone (e.g. go back). */
  onDeleted: () => void;
  /** A labelled button instead of the round trash icon. */
  label?: string;
  onFocus?: () => void;
};

/**
 * Deletes a title from the server, files and all. Only shown where Jellyfin
 * says this user may (`CanDelete`, from their deletion rights), and always
 * asks first, with Cancel focused.
 */
export function DeleteButton({ item, onDeleted, label, onFocus }: DeleteButtonProps) {
  const { api } = useAuthedSession();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!item?.Id || !item.CanDelete) return null;

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await getLibraryApi(api).deleteItem({ itemId: item.Id! });
      // Everything that might list it.
      await queryClient.invalidateQueries();
      setConfirming(false);
      onDeleted();
    } catch {
      setError('Couldn’t delete it. Check you still have permission and the server is reachable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {label ? (
        <Button label={label} size="sm" variant="ghost" onFocus={onFocus} onPress={() => setConfirming(true)} />
      ) : (
        <IconButton accessibilityLabel={`Delete ${item.Name ?? ''}`} icon={(color) => <TrashIcon color={color} />} onFocus={onFocus} onPress={() => setConfirming(true)} />
      )}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => !busy && setConfirming(false)}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 460, padding: spacing.xl, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface }}>
            <Text variant="title">Delete “{item.Name}”?</Text>
            <Text tone="secondary">
              This deletes {WHAT[item.Type ?? ''] ?? 'it'} from your server, including the files. It can’t be undone.
            </Text>
            {error ? (
              <Text variant="caption" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label="Cancel" size="md" variant="secondary" hasTVPreferredFocus onPress={() => setConfirming(false)} />
              <Button label={busy ? 'Deleting…' : 'Delete'} size="md" variant="ghost" onPress={() => !busy && remove()} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
