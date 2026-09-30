import { Image } from 'expo-image';
import { View } from 'react-native';
import { colors, focus } from '../tokens';
import { Focusable, type FocusableProps } from './Focusable';
import { Text } from './Text';

// Stable per-name backgrounds for users without a picture.
const PALETTE = [colors.accent, colors.highlight, colors.danger, colors.warning, colors.success, colors.accentStrong];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** FNV-1a: spreads similar names across the palette (a plain ×31 hash mod 6 only sums the letters). */
function paletteFor(name: string) {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export type AvatarProps = {
  name: string;
  imageUri?: string;
  size?: number;
};

/** A user's picture, or their initials on a colour derived from their name. */
export function Avatar({ name, imageUri, size = 40 }: AvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: imageUri ? colors.surfaceRaised : paletteFor(name),
      }}
    >
      {imageUri ? (
        <Image source={imageUri} cachePolicy="memory-disk" style={{ width: size, height: size }} />
      ) : (
        <Text variant={size >= 48 ? 'title' : 'label'} style={{ color: colors.textInverse, fontWeight: '700' }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

export type AvatarButtonProps = Omit<FocusableProps, 'children' | 'style'> & AvatarProps;

/** Focusable avatar, e.g. the user switcher trigger: a white ring when focused. */
export function AvatarButton({ name, imageUri, size = 40, ...rest }: AvatarButtonProps) {
  return (
    <Focusable accessibilityRole="button" focusScale={1.1} {...rest}>
      {({ focused }) => (
        <View
          style={{
            padding: focus.ringWidth / 2,
            borderRadius: size,
            borderWidth: focus.ringWidth,
            borderColor: focused ? colors.focusRing : 'transparent',
          }}
        >
          <Avatar name={name} imageUri={imageUri} size={size - focus.ringWidth * 3} />
        </View>
      )}
    </Focusable>
  );
}
