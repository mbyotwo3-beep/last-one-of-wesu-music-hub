import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Trash2, Plus, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import {
  getAllHomepageLayouts,
  saveHomepageLayout,
  DEFAULT_LAYOUTS,
  type HomepageLayout,
  type HomepageShelf,
  type ShelfType,
} from "@/lib/homepage.functions";
import { CarouselBuilder } from "@/components/CarouselBuilder";

export const Route = createFileRoute("/superadmin/homepage")({
  head: () => ({ meta: [{ title: "Homepage Builder — Wesu+" }] }),
  component: () => (
    <RoleGate require="superadmin">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

const PAGES = [
  { key: "home", label: "Home / Listen Now" },
  { key: "browse", label: "Browse" },
  { key: "listen-now", label: "Listen Now (secondary)" },
];

const SHELF_TYPES: { value: ShelfType; label: string }[] = [
  { value: "new_music", label: "New Music" },
  { value: "hot_tracks", label: "Hot Tracks" },
  { value: "must_have_albums", label: "Featured Albums" },
  { value: "featured_artists", label: "Featured Artists" },
  { value: "recently_played", label: "Recently Played" },
  { value: "by_genre", label: "By Genre" },
  { value: "by_artist", label: "By Artist" },
  { value: "by_playlist", label: "By Playlist" },
  { value: "custom", label: "Custom" },
];

function Page() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getAllHomepageLayouts);
  const saveFn = useServerFn(saveHomepageLayout);

  const [activePage, setActivePage] = useState("home");
  const [layout, setLayout] = useState<HomepageLayout>(DEFAULT_LAYOUTS.home);

  const { data: all, isLoading, error } = useQuery({
    queryKey: ["homepage-layouts"],
    queryFn: () => loadFn(),
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading homepage layouts…</div>;
  if (error) return <div className="p-12 text-center text-destructive">Error loading layouts: {(error as Error).message}</div>;

  useEffect(() => {
    if (all && all[activePage]) setLayout(all[activePage]);
    else setLayout(DEFAULT_LAYOUTS[activePage] ?? { hero_slides: [], shelves: [] });
  }, [all, activePage]);

  const save = useMutation({
    mutationFn: saveFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homepage-layouts"] });
      toast.success("Homepage saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const oldIdx = prev.shelves.findIndex((s) => s.id === active.id);
      const newIdx = prev.shelves.findIndex((s) => s.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return { ...prev, shelves: arrayMove(prev.shelves, oldIdx, newIdx) };
    });
  }

  function updateShelf(id: string, patch: Partial<HomepageShelf>) {
    setLayout((p) => ({ ...p, shelves: p.shelves.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  function addShelf() {
    setLayout((p) => ({
      ...p,
      shelves: [
        ...p.shelves,
        {
          id: `s_${Date.now()}`,
          type: "new_music",
          title: "New Shelf",
          visible: true,
        },
      ],
    }));
  }

  function removeShelf(id: string) {
    setLayout((p) => ({ ...p, shelves: p.shelves.filter((s) => s.id !== id) }));
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-32">
      <Link to="/superadmin" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 cursor-pointer">
        <ArrowLeft className="size-4" /> Back to Superadmin
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Homepage Builder</h1>
        <button
          onClick={() => save.mutate({ data: { page: activePage, layout } })}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-obsidian font-semibold disabled:opacity-50 cursor-pointer hover:scale-105 transition-transform"
        >
          <Save className="size-4" /> {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        {PAGES.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePage(p.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
              activePage === p.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Shelves</h2>
          <button
            onClick={addShelf}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-secondary hover:bg-accent cursor-pointer transition-colors"
          >
            <Plus className="size-3" /> Add shelf
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Drag to reorder. Toggle visibility, edit title, and choose data source.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layout.shelves.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {layout.shelves.map((shelf) => (
                <SortableShelfRow
                  key={shelf.id}
                  shelf={shelf}
                  onUpdate={(patch) => updateShelf(shelf.id, patch)}
                  onRemove={() => removeShelf(shelf.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {layout.shelves.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No shelves. Add one to get started.</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Hero Slider</h2>
          <button
            onClick={() => {
              setLayout((p) => ({
                ...p,
                hero_slides: [
                  ...p.hero_slides,
                  {
                    id: `slide_${Date.now()}`,
                    title: "New Slide",
                    subtitle: "Subtitle",
                    image_url: "",
                    gradient: "rgba(250, 36, 60, 0.8)",
                    link_url: "",
                  },
                ],
              }));
            }}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-secondary hover:bg-accent cursor-pointer"
          >
            <Plus className="size-3" /> Add slide
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {layout.hero_slides.length} slide{layout.hero_slides.length === 1 ? "" : "s"}
        </p>
        <div className="space-y-3">
          {layout.hero_slides.map((slide, idx) => (
            <div key={slide.id} className="p-4 bg-secondary/40 border border-border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Slide {idx + 1}</span>
                <button
                  onClick={() => {
                    setLayout((p) => ({
                      ...p,
                      hero_slides: p.hero_slides.filter((s) => s.id !== slide.id),
                    }));
                  }}
                  className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                  aria-label="Delete slide"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <input
                value={slide.title}
                onChange={(e) => {
                  setLayout((p) => ({
                    ...p,
                    hero_slides: p.hero_slides.map((s) =>
                      s.id === slide.id ? { ...s, title: e.target.value } : s
                    ),
                  }));
                }}
                placeholder="Title"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              />
              <input
                value={slide.subtitle}
                onChange={(e) => {
                  setLayout((p) => ({
                    ...p,
                    hero_slides: p.hero_slides.map((s) =>
                      s.id === slide.id ? { ...s, subtitle: e.target.value } : s
                    ),
                  }));
                }}
                placeholder="Subtitle"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              />
              <input
                value={slide.image_url}
                onChange={(e) => {
                  setLayout((p) => ({
                    ...p,
                    hero_slides: p.hero_slides.map((s) =>
                      s.id === slide.id ? { ...s, image_url: e.target.value } : s
                    ),
                  }));
                }}
                placeholder="Image URL"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              />
              <input
                value={slide.link_url}
                onChange={(e) => {
                  setLayout((p) => ({
                    ...p,
                    hero_slides: p.hero_slides.map((s) =>
                      s.id === slide.id ? { ...s, link_url: e.target.value } : s
                    ),
                  }));
                }}
                placeholder="Link URL (optional)"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
              />
              <input
                value={slide.gradient}
                onChange={(e) => {
                  setLayout((p) => ({
                    ...p,
                    hero_slides: p.hero_slides.map((s) =>
                      s.id === slide.id ? { ...s, gradient: e.target.value } : s
                    ),
                  }));
                }}
                placeholder="Gradient (e.g., rgba(250, 36, 60, 0.8))"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          ))}
          {layout.hero_slides.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No slides. Add one to get started.</p>
          )}
        </div>
      </div>

      {/* Carousel Builder */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <CarouselBuilder />
      </div>
    </div>
  );
}

function SortableShelfRow({
  shelf,
  onUpdate,
  onRemove,
}: {
  shelf: HomepageShelf;
  onUpdate: (p: Partial<HomepageShelf>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shelf.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-secondary/40 border border-border rounded-lg"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab p-1 cursor-pointer"
        aria-label="Drag"
      >
        <GripVertical className="size-4" />
      </button>
      <select
        value={shelf.type}
        onChange={(e) => onUpdate({ type: e.target.value as ShelfType })}
        className="bg-background border border-border rounded px-2 py-1 text-xs"
      >
        {SHELF_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <input
        value={shelf.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm"
      />
      {(shelf.type === "by_genre") && (
        <input
          placeholder="Genre"
          value={shelf.query?.genre ?? ""}
          onChange={(e) => onUpdate({ query: { ...shelf.query, genre: e.target.value } })}
          className="w-28 bg-background border border-border rounded px-2 py-1 text-xs"
        />
      )}
      {(shelf.type === "by_artist" || shelf.type === "by_playlist") && (
        <input
          placeholder="ID"
          value={shelf.query?.artistId ?? shelf.query?.playlistId ?? ""}
          onChange={(e) => onUpdate({
            query: shelf.type === "by_artist"
              ? { ...shelf.query, artistId: e.target.value }
              : { ...shelf.query, playlistId: e.target.value }
          })}
          className="w-40 bg-background border border-border rounded px-2 py-1 text-xs font-mono"
        />
      )}
      <button
        onClick={() => onUpdate({ visible: !shelf.visible })}
        className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label={shelf.visible ? "Hide" : "Show"}
      >
        {shelf.visible ? <Eye className="size-4" /> : <EyeOff className="size-4 opacity-50" />}
      </button>
      <button
        onClick={onRemove}
        className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
