import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto, ImageType } from '@jellyfin/sdk/lib/generated-client/models';

function url(api: Api, itemId: string, type: ImageType, tag: string | undefined, maxWidth: number, index?: number) {
  const path = index === undefined ? type : `${type}/${index}`;
  const params = new URLSearchParams({ maxWidth: String(maxWidth), quality: '90' });
  if (tag) params.set('tag', tag);
  return `${api.basePath}/Items/${itemId}/Images/${path}?${params}`;
}

/** Poster-shaped art: the item's own Primary, falling back to its series/album. */
export function posterUrl(api: Api, item: BaseItemDto, maxWidth = 300): string | undefined {
  if (item.ImageTags?.Primary && item.Id) return url(api, item.Id, 'Primary', item.ImageTags.Primary, maxWidth);
  if (item.SeriesId && item.SeriesPrimaryImageTag) return url(api, item.SeriesId, 'Primary', item.SeriesPrimaryImageTag, maxWidth);
  if (item.AlbumId && item.AlbumPrimaryImageTag) return url(api, item.AlbumId, 'Primary', item.AlbumPrimaryImageTag, maxWidth);
  return undefined;
}

/** 16:9 art for landscape cards: Thumb, then Backdrop, then an episode's own still. */
export function landscapeUrl(api: Api, item: BaseItemDto, maxWidth = 480): string | undefined {
  if (item.Id && item.ImageTags?.Thumb) return url(api, item.Id, 'Thumb', item.ImageTags.Thumb, maxWidth);
  if (item.Type === 'Episode' && item.Id && item.ImageTags?.Primary) {
    return url(api, item.Id, 'Primary', item.ImageTags.Primary, maxWidth);
  }
  if (item.ParentThumbItemId && item.ParentThumbImageTag) {
    return url(api, item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag, maxWidth);
  }
  return backdropUrl(api, item, maxWidth);
}

/** Full-bleed art for the summary preview. */
export function backdropUrl(api: Api, item: BaseItemDto, maxWidth = 1920): string | undefined {
  if (item.Id && item.BackdropImageTags?.length) return url(api, item.Id, 'Backdrop', item.BackdropImageTags[0], maxWidth, 0);
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
    return url(api, item.ParentBackdropItemId, 'Backdrop', item.ParentBackdropImageTags[0], maxWidth, 0);
  }
  return undefined;
}

export function logoUrl(api: Api, item: BaseItemDto, maxWidth = 600): string | undefined {
  if (item.Id && item.ImageTags?.Logo) return url(api, item.Id, 'Logo', item.ImageTags.Logo, maxWidth);
  if (item.ParentLogoItemId && item.ParentLogoImageTag) return url(api, item.ParentLogoItemId, 'Logo', item.ParentLogoImageTag, maxWidth);
  return undefined;
}

/** A cast or crew member's photo (People entries carry their own image tag). */
export function personImageUrl(api: Api, person: { Id?: string | null; PrimaryImageTag?: string | null }, maxWidth = 160): string | undefined {
  if (!person.Id || !person.PrimaryImageTag) return undefined;
  return url(api, person.Id, 'Primary', person.PrimaryImageTag, maxWidth);
}
