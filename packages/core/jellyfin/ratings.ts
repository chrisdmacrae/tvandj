import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { useQuery } from '@tanstack/react-query';

/**
 * Jellyfin's own metadata comes from TMDB/TVDB, which carry an audience score
 * but not IMDb's rating or Rotten Tomatoes. When an OMDb key is configured we
 * look those up by the item's IMDb id; otherwise we fall back to what the
 * server has (Rotten Tomatoes only if the server runs the OMDb provider).
 */
const OMDB_API_KEY = process.env.EXPO_PUBLIC_OMDB_API_KEY;

export type Ratings = {
  imdb?: string; // "7.8"
  rottenTomatoes?: number; // 0–100
  audience?: string; // TMDB/TVDB community score, "6.5"
};

type OmdbResponse = { Response: 'True' | 'False'; imdbRating?: string; Ratings?: { Source: string; Value: string }[] };

async function fetchOmdb(imdbId: string): Promise<Pick<Ratings, 'imdb' | 'rottenTomatoes'>> {
  const res = await fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${OMDB_API_KEY}`);
  const data = (await res.json()) as OmdbResponse;
  if (data.Response !== 'True') return {};
  const rt = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value;
  return {
    imdb: data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : undefined,
    rottenTomatoes: rt ? parseInt(rt, 10) : undefined,
  };
}

export function useRatings(item: BaseItemDto | undefined): Ratings {
  const imdbId = item?.ProviderIds?.Imdb ?? undefined;
  const { data: omdb } = useQuery({
    queryKey: ['omdb', imdbId],
    enabled: !!OMDB_API_KEY && !!imdbId,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: () => fetchOmdb(imdbId!),
  });

  return {
    imdb: omdb?.imdb,
    rottenTomatoes: omdb?.rottenTomatoes ?? (item?.CriticRating ?? undefined),
    audience: omdb?.imdb || item?.CommunityRating == null ? undefined : item.CommunityRating.toFixed(1),
  };
}
