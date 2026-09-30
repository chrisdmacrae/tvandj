import { useState } from 'react';
import { Modal, View } from 'react-native';
import { Button, Text, colors, radii, spacing } from '@tv-and-j/design-system';
import type { AlbumRef, MediaKind } from '@tv-and-j/core/downloadarr/client';
import { useAlbumRequest, useRemoveRequest, useRequestFor } from '@tv-and-j/core/downloadarr/hooks';

type RemoveRequestButtonProps = {
  title: string;
  onFocus?: () => void;
  hasTVPreferredFocus?: boolean;
} & ({ kind: MediaKind; tmdbId: string | number } | { kind: 'album'; album: AlbumRef });

/**
 * Takes back a downloadarr request: stops the search and cancels any download
 * in flight. Always asks first, with Cancel focused. Nothing without a request.
 */
export function RemoveRequestButton(props: RemoveRequestButtonProps) {
  const { kind, title, onFocus, hasTVPreferredFocus } = props;
  const titleRequest = useRequestFor(kind === 'album' ? 'movie' : kind, props.kind === 'album' ? undefined : props.tmdbId);
  const albumRequest = useAlbumRequest(props.kind === 'album' ? props.album : undefined);
  const request = titleRequest ?? albumRequest;
  const remove = useRemoveRequest();
  const [confirming, setConfirming] = useState(false);

  if (!request) return null;

  const close = () => {
    setConfirming(false);
    remove.reset();
  };

  return (
    <>
      <Button label="Remove request" size="sm" variant="ghost" hasTVPreferredFocus={hasTVPreferredFocus} onFocus={onFocus} onPress={() => setConfirming(true)} />
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => !remove.isPending && close()}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 460, padding: spacing.xl, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface }}>
            <Text variant="title">Remove your request for “{title}”?</Text>
            <Text tone="secondary">
              downloadarr stops looking for it and cancels any download in progress.
              {kind === 'tv' ? ' Episodes already in your library stay there.' : ''}
            </Text>
            {remove.isError ? (
              <Text variant="caption" style={{ color: colors.danger }}>
                {remove.error.message}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Button label="Cancel" size="md" variant="secondary" hasTVPreferredFocus onPress={close} />
              <Button
                label={remove.isPending ? 'Removing…' : 'Remove'}
                size="md"
                variant="ghost"
                onPress={() => !remove.isPending && remove.mutate(request.id, { onSuccess: () => setConfirming(false) })}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
