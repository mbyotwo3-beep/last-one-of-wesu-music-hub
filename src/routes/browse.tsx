import { createFileRoute } from "@tanstack/react-router";
import { usePlatform } from "@/hooks/use-platform";
import { MobileBrowse } from "@/components/mobile/screens/MobileBrowse";
import { HeroSlider } from "@/components/HeroSlider";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { AlbumCard } from "@/components/AlbumCard";
import { TrackRow } from "@/components/TrackRow";
import { browseFeaturedSlides, newMusicAlbums, mustHaveAlbums, hotTracks } from "@/lib/mockData";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse — Wesu+" },
      {
        name: "description",
        content: "Discover and stream the best Zambian and African music on Wesu+.",
      },
    ],
  }),
  component: BrowseRoute,
});

function BrowseRoute() {
  const platform = usePlatform();
  return platform === "native" ? <MobileBrowse /> : <BrowsePage />;
}

function BrowsePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8">
        {/* Hero Slider */}
        <HeroSlider slides={browseFeaturedSlides} />

        {/* New Music - 2-row grid */}
        <HorizontalShelf title="New Music" showAllLink="/new-music">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 min-w-max">
            {newMusicAlbums.map((album) => (
              <div key={album.id} className="w-36 md:w-40 lg:w-48">
                <AlbumCard
                  id={album.id}
                  title={album.title}
                  subtitle={album.artist}
                  imageUrl={album.imageUrl}
                  audioUrl={album.audioUrl}
                  duration={album.duration}
                />
                <div className="mt-2">
                  <p className="text-sm font-semibold text-foreground truncate">{album.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </HorizontalShelf>

        {/* Must-Have Albums - Single row larger cards */}
        <HorizontalShelf title="Must-Have Albums" showAllLink="/must-have">
          <div className="flex gap-3 md:gap-4 min-w-max">
            {mustHaveAlbums.map((album) => (
              <div key={album.id} className="w-44 md:w-52 lg:w-56 xl:w-64">
                <AlbumCard
                  id={album.id}
                  title={album.title}
                  subtitle={album.artist}
                  imageUrl={album.imageUrl}
                  audioUrl={album.audioUrl}
                  duration={album.duration}
                />
                <div className="mt-2">
                  <p className="text-sm font-semibold text-foreground truncate">{album.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </HorizontalShelf>

        {/* Hot Tracks - List view */}
        <HorizontalShelf title="Hot Tracks" showAllLink="/hot-tracks">
          <div className="w-full min-w-max">
            <div className="space-y-1">
              {hotTracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  {...track}
                  index={index + 1}
                />
              ))}
            </div>
          </div>
        </HorizontalShelf>
      </div>
    </div>
  );
}
