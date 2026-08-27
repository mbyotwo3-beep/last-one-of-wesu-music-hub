export type AnalyticsScope = "listener" | "artist" | "label" | "platform";

export interface AnalyticsData {
  scope: AnalyticsScope;
  days: number;
  streams: number;
  uniqueListeners: number;
  uniqueSongs: number;
  minutesListened: number;
  activeDays: number;
  daily: Array<{ date: string; streams: number }>;
  topTracks: Array<{
    id: string;
    title: string;
    artistName: string;
    streams: number;
    minutes: number;
  }>;
  topArtists: Array<{ id: string; name: string; streams: number }>;
}

const dayKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

export function aggregateAnalytics(
  rows: any[],
  scope: AnalyticsScope,
  days: number,
  songMeta: Map<string, any> = new Map(),
): AnalyticsData {
  const tracks = new Map<string, { id: string; title: string; artistName: string; streams: number; seconds: number }>();
  const artists = new Map<string, { id: string; name: string; streams: number }>();
  const listeners = new Set<string>();
  const daysSeen = new Set<string>();
  const dailyMap = new Map<string, number>();

  for (const row of rows) {
    const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
    const meta = song ?? songMeta.get(row.song_id) ?? {};
    const songId = String(row.song_id ?? meta.id ?? "");
    if (!songId) continue;
    const playedAt = row.played_at ?? new Date().toISOString();
    const date = dayKey(playedAt);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    daysSeen.add(date);
    if (row.user_id) listeners.add(String(row.user_id));

    const artist = Array.isArray(meta.artists) ? meta.artists[0] : (meta.artists ?? meta.artist);
    const artistId = String(meta.artist_id ?? artist?.id ?? "unknown");
    const artistName = artist?.name ?? "Unknown artist";
    const track = tracks.get(songId) ?? {
      id: songId,
      title: meta.title ?? "Untitled",
      artistName,
      streams: 0,
      seconds: 0,
    };
    track.streams += 1;
    track.seconds += Math.max(0, Number(row.progress_seconds ?? 0));
    tracks.set(songId, track);

    const artistRow = artists.get(artistId) ?? { id: artistId, name: artistName, streams: 0 };
    artistRow.streams += 1;
    artists.set(artistId, artistRow);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dayKey(date);
    return { date: key, streams: dailyMap.get(key) ?? 0 };
  });

  return {
    scope,
    days,
    streams: rows.length,
    uniqueListeners: listeners.size,
    uniqueSongs: tracks.size,
    minutesListened: Math.round((rows.reduce((sum, row) => sum + Math.max(0, Number(row.progress_seconds ?? 0)), 0) / 60) * 10) / 10,
    activeDays: daysSeen.size,
    daily,
    topTracks: Array.from(tracks.values())
      .sort((a, b) => b.streams - a.streams || b.seconds - a.seconds)
      .slice(0, 10)
      .map((track) => ({ ...track, minutes: Math.round((track.seconds / 60) * 10) / 10 })),
    topArtists: Array.from(artists.values()).sort((a, b) => b.streams - a.streams).slice(0, 10),
  };
}

