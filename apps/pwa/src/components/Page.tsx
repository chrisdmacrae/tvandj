import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon, IconButton, Text, colors, spacing, useLayout } from '@tv-and-j/design-system';
import { GlowProvider } from '@tv-and-j/core/state/GlowContext';
import { goBack } from '../lib/nav';
import { FocusGlow } from './FocusGlow';

type PageProps = {
  /** Shown beside a back button; leave out for top-level screens. */
  title?: string;
  back?: boolean;
  children: ReactNode;
  /** Scrolls by default; pass false when the content scrolls itself (grids). */
  scroll?: boolean;
  /** Extra space at the bottom, e.g. above the phone's bottom navigation. */
  bottomSpace?: number;
  /** Light the top edge in the colour of the focused or hovered card (screens of cards). */
  glow?: boolean;
};

/** A screen: safe areas (notch, home bar), the layout's side gutter, an optional back header. */
export function Page({ title, back, children, scroll = true, bottomSpace = 0, glow = false }: PageProps) {
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const header =
    back || title ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: gutter, paddingTop: insets.top + spacing.md, paddingBottom: spacing.md }}>
        {back ? <IconButton accessibilityLabel="Back" icon={(color) => <ArrowLeftIcon color={color} />} onPress={goBack} /> : null}
        {title ? (
          <Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Text>
        ) : null}
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );

  const page = (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {glow ? <FocusGlow /> : null}
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + bottomSpace + spacing.xl }}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <>
          {header}
          <View style={{ flex: 1 }}>{children}</View>
        </>
      )}
    </View>
  );
  return glow ? <GlowProvider>{page}</GlowProvider> : page;
}
