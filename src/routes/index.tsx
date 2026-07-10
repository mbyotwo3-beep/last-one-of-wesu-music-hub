import { createFileRoute, Link } from "@tanstack/react-router";
import { HeroSlider } from "@/components/HeroSlider";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { AlbumCard } from "@/components/AlbumCard";
import { TrackRow } from "@/components/TrackRow";
import { homeFeaturedSlides, homeRecentlyPlayed, homeForYou, homeTopTracks } from "@/lib/mockData";
import { usePlatform } from "@/hooks/use-platform";
import { MobileHome } from "@/components/mobile/screens/MobileHome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Listen Now — Wesu+" },
      {
        name: "description",
        content:
          "Stream the best Zambian and African music. Free & Premium tiers. Pay with MTN MoMo, Airtel Money, Zamtel Kwacha, or card.",
      },
      { property: "og:title", content: "Wesu+ — Stream Zambian & African Music" },
      {
        property: "og:description",
        content: "Stream the best Zambian and African music. Free & Premium tiers.",
      },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const platform = usePlatform();
  return platform === "native" ? <MobileHome /> : <HomePage />;
}

function HomePage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8">
        {/* Hero Slider */}
        <HeroSlider slides={homeFeaturedSlides} />

        {/* Recently Played - 2-row grid */}
        <HorizontalShelf title="Recently Played" showAllLink="/recently-added">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 min-w-max">
            {homeRecentlyPlayed.map((album) => (
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

        {/* Made For You - Single row larger cards */}
        <HorizontalShelf title="Made For You" showAllLink="/browse">
          <div className="flex gap-3 md:gap-4 min-w-max">
            {homeForYou.map((album) => (
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

        {/* Top Tracks - List view */}
        <HorizontalShelf title="Top Tracks" showAllLink="/browse">
          <div className="w-full min-w-max">
            <div className="space-y-1">
              {homeTopTracks.map((track, index) => (
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
