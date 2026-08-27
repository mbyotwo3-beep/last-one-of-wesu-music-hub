import { BarChart3, Clock3, Headphones, Music2, Users } from "lucide-react";
import type { AnalyticsData, AnalyticsScope } from "@/lib/analytics-utils";

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes.toFixed(minutes % 1 ? 1 : 0)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

export function AnalyticsSection({ data, scope, title = "Listening analytics" }: { data?: AnalyticsData; scope: AnalyticsScope; title?: string }) {
  if (!data) return null;
  const max = Math.max(1, ...data.daily.map((day) => day.streams));
  const listenerLabel = scope === "listener" ? "Listening days" : "Unique listeners";
  const listenerValue = scope === "listener" ? data.activeDays : data.uniqueListeners;
  const cards = [
    { label: scope === "listener" ? "Minutes listened" : "Minutes streamed", value: formatMinutes(data.minutesListened), icon: Clock3 },
    { label: scope === "listener" ? "Plays" : "Streams", value: data.streams.toLocaleString(), icon: Headphones },
    { label: scope === "listener" ? "Tracks explored" : "Tracks", value: data.uniqueSongs.toLocaleString(), icon: Music2 },
    { label: listenerLabel, value: listenerValue.toLocaleString(), icon: Users },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">Last 30 days · updated when a track starts playing</p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-2xl p-5">
            <card.icon className="size-5 text-primary mb-3" />
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Daily activity</h3>
          <div className="h-32 flex items-end gap-1.5">
            {data.daily.map((day) => (
              <div key={day.date} className="flex-1 h-full flex items-end group" title={`${day.date}: ${day.streams} plays`}>
                <div className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors" style={{ height: `${Math.max(day.streams ? 8 : 2, (day.streams / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2"><span>{data.daily[0]?.date}</span><span>{data.daily[data.daily.length - 1]?.date}</span></div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Top tracks</h3>
          {data.topTracks.length === 0 ? <p className="text-sm text-muted-foreground">No listening activity yet.</p> : (
            <div className="space-y-2">
              {data.topTracks.slice(0, 5).map((track, index) => (
                <div key={track.id} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-muted-foreground text-xs">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="font-medium truncate">{track.title}</p><p className="text-xs text-muted-foreground truncate">{track.artistName}</p></div>
                  <span className="text-xs text-muted-foreground">{track.streams}×</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {data.topArtists.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-3">Top artists</h3>
          <div className="flex flex-wrap gap-2">{data.topArtists.slice(0, 8).map((artist) => <span key={artist.id} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{artist.name} · {artist.streams} streams</span>)}</div>
        </div>
      )}
    </section>
  );
}

