export interface FeaturedSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  gradient: string;
  audioUrl?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  audioUrl?: string;
  duration?: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  coverUrl: string;
  audioUrl?: string;
}

// Home page (Listen Now) - Personalized/curated content
export const homeFeaturedSlides: FeaturedSlide[] = [
  {
    id: "home-feat-1",
    title: "Made For You",
    subtitle: "Personalized recommendations based on your taste",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.8)",
  },
  {
    id: "home-feat-2",
    title: "Recently Played",
    subtitle: "Jump back into your listening history",
    imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.7)",
  },
  {
    id: "home-feat-3",
    title: "Top Picks",
    subtitle: "Curated selections just for you",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.6)",
  },
];

export const homeRecentlyPlayed: Album[] = [
  {
    id: "recent-1",
    title: "Midnight Dreams",
    artist: "Luna Echo",
    imageUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop",
    duration: 245,
  },
  {
    id: "recent-2",
    title: "Urban Soul",
    artist: "The Collective",
    imageUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400&h=400&fit=crop",
    duration: 198,
  },
  {
    id: "recent-3",
    title: "Neon Nights",
    artist: "Synthwave",
    imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=400&fit=crop",
    duration: 312,
  },
  {
    id: "recent-4",
    title: "Acoustic Sessions",
    artist: "Sarah Mitchell",
    imageUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=400&fit=crop",
    duration: 187,
  },
];

export const homeForYou: Album[] = [
  {
    id: "foryou-1",
    title: "Chill Mix",
    artist: "Curated",
    imageUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop",
    duration: 276,
  },
  {
    id: "foryou-2",
    title: "Workout Beats",
    artist: "Energy",
    imageUrl: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&h=400&fit=crop",
    duration: 234,
  },
  {
    id: "foryou-3",
    title: "Focus Flow",
    artist: "Ambient",
    imageUrl: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=400&h=400&fit=crop",
    duration: 201,
  },
  {
    id: "foryou-4",
    title: "Party Hits",
    artist: "Dance",
    imageUrl: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&h=400&fit=crop",
    duration: 267,
  },
];

export const homeTopTracks: Track[] = [
  {
    id: "home-track-1",
    title: "Electric Feel",
    artist: "Neon Dreams",
    album: "Midnight City",
    duration: "3:45",
    coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&h=100&fit=crop",
  },
  {
    id: "home-track-2",
    title: "Sunset Boulevard",
    artist: "The Coast",
    album: "California Dreams",
    duration: "4:12",
    coverUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f436?w=100&h=100&fit=crop",
  },
  {
    id: "home-track-3",
    title: "City Lights",
    artist: "Metro Sound",
    album: "Urban Jungle",
    duration: "3:28",
    coverUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop",
  },
  {
    id: "home-track-4",
    title: "Ocean Waves",
    artist: "Blue Horizon",
    album: "Seaside",
    duration: "4:01",
    coverUrl: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=100&h=100&fit=crop",
  },
];

// Browse page - Discovery-focused content
export const browseFeaturedSlides: FeaturedSlide[] = [
  {
    id: "browse-feat-1",
    title: "New Music Friday",
    subtitle: "The best new releases from around the world",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.8)",
  },
  {
    id: "browse-feat-2",
    title: "African Beats",
    subtitle: "Discover the hottest tracks from across Africa",
    imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.7)",
  },
  {
    id: "browse-feat-3",
    title: "Chill Vibes",
    subtitle: "Relax and unwind with these smooth melodies",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.6)",
  },
  {
    id: "browse-feat-4",
    title: "Electronic Dreams",
    subtitle: "The future of sound is here",
    imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
    gradient: "rgba(250, 36, 60, 0.75)",
  },
];

export const newMusicAlbums: Album[] = [
  {
    id: "album-1",
    title: "Midnight Dreams",
    artist: "Luna Echo",
    imageUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop",
    duration: 245,
  },
  {
    id: "album-2",
    title: "Urban Soul",
    artist: "The Collective",
    imageUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400&h=400&fit=crop",
    duration: 198,
  },
  {
    id: "album-3",
    title: "Neon Nights",
    artist: "Synthwave",
    imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=400&fit=crop",
    duration: 312,
  },
  {
    id: "album-4",
    title: "Acoustic Sessions",
    artist: "Sarah Mitchell",
    imageUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=400&fit=crop",
    duration: 187,
  },
  {
    id: "album-5",
    title: "Rhythm & Blues",
    artist: "Blue Note",
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop",
    duration: 276,
  },
  {
    id: "album-6",
    title: "Jazz Cafe",
    artist: "Smooth Trio",
    imageUrl: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&h=400&fit=crop",
    duration: 234,
  },
  {
    id: "album-7",
    title: "Pop Explosion",
    artist: "Starlight",
    imageUrl: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=400&h=400&fit=crop",
    duration: 201,
  },
  {
    id: "album-8",
    title: "Indie Folk",
    artist: "Woodland",
    imageUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop",
    duration: 267,
  },
];

export const mustHaveAlbums: Album[] = [
  {
    id: "must-1",
    title: "Greatest Hits",
    artist: "Legendary Artists",
    imageUrl: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&h=400&fit=crop",
    duration: 345,
  },
  {
    id: "must-2",
    title: "Summer Vibes",
    artist: "Beach Boys",
    imageUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f436?w=400&h=400&fit=crop",
    duration: 289,
  },
  {
    id: "must-3",
    title: "Classic Rock",
    artist: "The Icons",
    imageUrl: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&h=400&fit=crop",
    duration: 312,
  },
  {
    id: "must-4",
    title: "Hip Hop Essentials",
    artist: "Urban Legends",
    imageUrl: "https://images.unsplash.com/photo-1571609860754-01313e4ff1f9?w=400&h=400&fit=crop",
    duration: 278,
  },
  {
    id: "must-5",
    title: "Electronic Anthems",
    artist: "DJ Collective",
    imageUrl: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&h=400&fit=crop",
    duration: 298,
  },
];

export const hotTracks: Track[] = [
  {
    id: "track-1",
    title: "Electric Feel",
    artist: "Neon Dreams",
    album: "Midnight City",
    duration: "3:45",
    coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&h=100&fit=crop",
  },
  {
    id: "track-2",
    title: "Sunset Boulevard",
    artist: "The Coast",
    album: "California Dreams",
    duration: "4:12",
    coverUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f436?w=100&h=100&fit=crop",
  },
  {
    id: "track-3",
    title: "City Lights",
    artist: "Metro Sound",
    album: "Urban Jungle",
    duration: "3:28",
    coverUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop",
  },
  {
    id: "track-4",
    title: "Ocean Waves",
    artist: "Blue Horizon",
    album: "Seaside",
    duration: "4:01",
    coverUrl: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=100&h=100&fit=crop",
  },
  {
    id: "track-5",
    title: "Starlight",
    artist: "Cosmic Journey",
    album: "Galaxy",
    duration: "3:55",
    coverUrl: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=100&h=100&fit=crop",
  },
  {
    id: "track-6",
    title: "Thunder Road",
    artist: "Storm Chaser",
    album: "Lightning",
    duration: "4:33",
    coverUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=100&h=100&fit=crop",
  },
  {
    id: "track-7",
    title: "Velvet Sky",
    artist: "Night Owl",
    album: "After Hours",
    duration: "3:18",
    coverUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&h=100&fit=crop",
  },
  {
    id: "track-8",
    title: "Golden Hour",
    artist: "Sunset Collective",
    album: "Dusk",
    duration: "4:22",
    coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop",
  },
];
