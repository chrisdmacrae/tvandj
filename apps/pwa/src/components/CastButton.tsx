import { router } from 'expo-router';
import { useState } from 'react';
import { CastIcon, IconButton } from '@tv-and-j/design-system';
import { useRemoteTarget } from '../lib/remoteTarget';
import { DevicePicker } from './DevicePicker';

/** Pick a screen (e.g. the TV) to control, and open its remote. */
export function CastButton() {
  const { sessionId, setSessionId } = useRemoteTarget();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton accessibilityLabel="Control another screen" selected={!!sessionId} icon={(c) => <CastIcon color={c} />} onPress={() => setOpen(true)} />
      <DevicePicker
        visible={open}
        onClose={() => setOpen(false)}
        onPick={(device) => {
          setOpen(false);
          setSessionId(device.Id);
          router.push({ pathname: '/remote/[id]', params: { id: device.Id } });
        }}
      />
    </>
  );
}
