import type { MediaStatus } from './hooks';

/** How a card shows a title's download state: a status line and, while downloading, progress. Both apps use it. */
export function downloadDisplay(status: MediaStatus): { download?: number | null; status?: string } {
  switch (status.state) {
    case 'downloading':
      return {
        download: status.progress,
        status: status.label ?? (status.progress == null ? 'Downloading…' : `Downloading ${Math.round(status.progress * 100)}%`),
      };
    case 'requested':
      return { download: null, status: status.label };
    case 'indexing':
      return { download: null, status: 'Adding to library…' };
    case 'failed':
      return { status: 'No download found' };
    default:
      return {};
  }
}
