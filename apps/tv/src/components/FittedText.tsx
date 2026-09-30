import { useEffect, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { Text, typography, type TextProps } from '@tv-and-j/design-system';

type FittedTextProps = Omit<TextProps, 'numberOfLines'> & {
  /** Most lines to show when there's room. */
  maxLines: number;
  children: string;
};

/**
 * Text that gives way when its column runs short: it measures the space the
 * layout leaves it and shows as many whole lines as fit, ending in "…",
 * instead of being clipped mid-line. Put it in a column that can shrink.
 */
export function FittedText({ maxLines, variant = 'body', children, ...rest }: FittedTextProps) {
  const [lines, setLines] = useState(maxLines);
  // New text or a new limit: start from the full length again.
  useEffect(() => setLines(maxLines), [children, maxLines]);
  const lineHeight = typography[variant].lineHeight * PixelRatio.getFontScale();

  return (
    <View
      style={{ flexShrink: 1, minHeight: lineHeight, overflow: 'hidden' }}
      onLayout={(e) => {
        const fit = Math.max(1, Math.min(maxLines, Math.floor((e.nativeEvent.layout.height + 1) / lineHeight)));
        if (fit < lines) setLines(fit);
      }}
    >
      <Text variant={variant} numberOfLines={lines} {...rest}>
        {children}
      </Text>
    </View>
  );
}
