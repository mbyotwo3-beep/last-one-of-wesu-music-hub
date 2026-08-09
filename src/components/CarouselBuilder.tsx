import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronUp,
  Link as LinkIcon, Image as ImageIcon, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAllCarousels,
  createCarousel,
  updateCarousel,
  deleteCarousel,
  addCarouselItem,
  updateCarouselItem,
  deleteCarouselItem,
  type Carousel,
  type CarouselItem,
} from "@/lib/carousel.functions";

/**
 * CarouselBuilder — full CRUD UI for managing homepage carousels.
 * Used in the Superadmin Homepage Builder and Admin "Carousels" tab.
 */
export function CarouselBuilder() {
  const qc = useQueryClient();

  const getAllFn = useServerFn(getAllCarousels);
  const createFn = useServerFn(createCarousel);
  const updateFn = useServerFn(updateCarousel);
  const deleteFn = useServerFn(deleteCarousel);
  const addItemFn = useServerFn(addCarouselItem);
  const updateItemFn = useServerFn(updateCarouselItem);
  const deleteItemFn = useServerFn(deleteCarouselItem);

  const { data: carousels, isLoading } = useQuery({
    queryKey: ["all-carousels"],
    queryFn: () => getAllFn(),
    retry: 1,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["all-carousels"] });

  // ── Create carousel ──────────────────────────────────────
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [newSeeAll, setNewSeeAll] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Carousel created!");
      setNewTitle(""); setNewSubtitle(""); setNewSeeAll("");
      setShowNewForm(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => { toast.success("Carousel updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => { toast.success("Carousel deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItemM = useMutation({
    mutationFn: addItemFn,
    onSuccess: () => { toast.success("Card added!"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItemM = useMutation({
    mutationFn: updateItemFn,
    onSuccess: () => { toast.success("Card updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItemM = useMutation({
    mutationFn: deleteItemFn,
    onSuccess: () => { toast.success("Card removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <div className="text-muted-foreground py-8 text-center">Loading carousels…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Homepage Carousels</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Horizontal swipeable rows shown on the homepage. Each row contains clickable cards with an image and a link.
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus className="size-4" /> New Carousel
        </button>
      </div>

      {/* New carousel form */}
      {showNewForm && (
        <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">New Carousel</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              placeholder="Title (e.g. New Releases)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
            <input
              placeholder="Subtitle (optional)"
              value={newSubtitle}
              onChange={(e) => setNewSubtitle(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
            <input
              placeholder='"See All" link e.g. /new-music'
              value={newSeeAll}
              onChange={(e) => setNewSeeAll(e.target.value)}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={!newTitle.trim() || createM.isPending}
              onClick={() =>
                createM.mutate({
                  data: {
                    title: newTitle.trim(),
                    subtitle: newSubtitle.trim() || undefined,
                    show_all_link: newSeeAll.trim() || undefined,
                  },
                })
              }
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
            >
              {createM.isPending ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 rounded-full bg-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing carousels list */}
      {(!carousels || carousels.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <GripVertical className="size-8 mx-auto mb-3 opacity-30" />
          <p>No carousels yet. Create your first one above.</p>
        </div>
      )}

      {(carousels ?? []).map((carousel, idx) => (
        <CarouselCard
          key={carousel.id}
          carousel={carousel}
          idx={idx}
          totalCount={carousels?.length ?? 0}
          onToggleActive={() =>
            updateM.mutate({ data: { id: carousel.id, active: !carousel.active } })
          }
          onMoveUp={() =>
            updateM.mutate({ data: { id: carousel.id, position: Math.max(0, carousel.position - 1) } })
          }
          onMoveDown={() =>
            updateM.mutate({ data: { id: carousel.id, position: carousel.position + 1 } })
          }
          onDelete={() => {
            if (!confirm(`Delete carousel "${carousel.title}" and all its cards?`)) return;
            deleteM.mutate({ data: { id: carousel.id } });
          }}
          onSaveTitle={(title, subtitle, show_all_link) =>
            updateM.mutate({ data: { id: carousel.id, title, subtitle, show_all_link } })
          }
          onAddItem={(d) => addItemM.mutate({ data: { carousel_id: carousel.id, ...d } })}
          onUpdateItem={(d) => updateItemM.mutate({ data: d })}
          onDeleteItem={(id) => deleteItemM.mutate({ data: { id } })}
          isPending={
            updateM.isPending || deleteM.isPending ||
            addItemM.isPending || updateItemM.isPending || deleteItemM.isPending
          }
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual carousel card (collapsible)
// ─────────────────────────────────────────────────────────────
function CarouselCard({
  carousel,
  idx,
  totalCount,
  onToggleActive,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaveTitle,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  isPending,
}: {
  carousel: Carousel;
  idx: number;
  totalCount: number;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSaveTitle: (title: string, subtitle: string | null, show_all_link: string | null) => void;
  onAddItem: (d: { title: string; subtitle?: string; image_url: string; link_url: string }) => void;
  onUpdateItem: (d: { id: string; title?: string; subtitle?: string | null; image_url?: string; link_url?: string; position?: number }) => void;
  onDeleteItem: (id: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(carousel.title);
  const [editSubtitle, setEditSubtitle] = useState(carousel.subtitle ?? "");
  const [editSeeAll, setEditSeeAll] = useState(carousel.show_all_link ?? "");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", subtitle: "", image_url: "", link_url: "" });

  return (
    <div
      className={`bg-card border rounded-2xl overflow-hidden transition-all ${
        carousel.active ? "border-border" : "border-border opacity-60"
      }`}
    >
      {/* Carousel header row */}
      <div className="flex items-center gap-3 p-4">
        {/* Position control */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={idx === 0 || isPending}
            aria-label="Move up"
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={idx === totalCount - 1 || isPending}
            aria-label="Move down"
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>

        <GripVertical className="size-4 text-muted-foreground/40" />

        {/* Title summary */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{carousel.title}</p>
          <p className="text-xs text-muted-foreground">
            {carousel.items.length} card{carousel.items.length !== 1 ? "s" : ""}
            {carousel.show_all_link ? ` · See All → ${carousel.show_all_link}` : ""}
            {!carousel.active ? " · Hidden" : ""}
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={onToggleActive}
          disabled={isPending}
          title={carousel.active ? "Hide carousel" : "Show carousel"}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {carousel.active ? <Eye className="size-4" /> : <EyeOff className="size-4 opacity-50" />}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Expand / collapse"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete carousel"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-5">
          {/* Edit carousel title / subtitle / see all */}
          <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Carousel Settings
            </h4>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Title</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Subtitle (optional)</span>
                <input
                  value={editSubtitle}
                  onChange={(e) => setEditSubtitle(e.target.value)}
                  placeholder="e.g. Handpicked for you"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  <LinkIcon className="size-3" /> "See All" link
                </span>
                <input
                  value={editSeeAll}
                  onChange={(e) => setEditSeeAll(e.target.value)}
                  placeholder="e.g. /new-music or /artists"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
              </label>
            </div>
            <button
              disabled={!editTitle.trim() || isPending}
              onClick={() =>
                onSaveTitle(
                  editTitle.trim(),
                  editSubtitle.trim() || null,
                  editSeeAll.trim() || null,
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
            >
              <Save className="size-3" /> Save Settings
            </button>
          </div>

          {/* Cards list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Cards ({carousel.items.length})</h4>
              <button
                onClick={() => setShowAddItem(!showAddItem)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-accent font-medium"
              >
                <Plus className="size-3" /> Add Card
              </button>
            </div>

            {/* Add card form */}
            {showAddItem && (
              <div className="bg-secondary/40 border border-border rounded-xl p-4 mb-4 space-y-3">
                <h5 className="text-xs font-semibold text-primary uppercase tracking-wide">New Card</h5>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 block">Card Title *</span>
                    <input
                      placeholder="e.g. Cleo Ice Queen"
                      value={newItem.title}
                      onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 block">Subtitle (optional)</span>
                    <input
                      placeholder="e.g. Hip-Hop · 12 songs"
                      value={newItem.subtitle}
                      onChange={(e) => setNewItem({ ...newItem, subtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1 block">
                      <ImageIcon className="size-3" /> Image URL *
                    </span>
                    <input
                      placeholder="https://… or storage path"
                      value={newItem.image_url}
                      onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1 block">
                      <LinkIcon className="size-3" /> Link URL *
                    </span>
                    <input
                      placeholder="e.g. /artists/uuid or /albums/uuid"
                      value={newItem.link_url}
                      onChange={(e) => setNewItem({ ...newItem, link_url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-xs"
                    />
                  </label>
                </div>
                {/* Image preview */}
                {newItem.image_url && (
                  <div className="flex items-center gap-3">
                    <img
                      src={newItem.image_url}
                      alt="preview"
                      className="w-16 h-16 rounded-lg object-cover bg-secondary"
                      onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")}
                    />
                    <span className="text-xs text-muted-foreground">Preview</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={!newItem.title.trim() || !newItem.image_url.trim() || !newItem.link_url.trim() || isPending}
                    onClick={() => {
                      onAddItem({
                        title: newItem.title.trim(),
                        subtitle: newItem.subtitle.trim() || undefined,
                        image_url: newItem.image_url.trim(),
                        link_url: newItem.link_url.trim(),
                      });
                      setNewItem({ title: "", subtitle: "", image_url: "", link_url: "" });
                      setShowAddItem(false);
                    }}
                    className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                  >
                    Add Card
                  </button>
                  <button
                    onClick={() => setShowAddItem(false)}
                    className="px-4 py-1.5 rounded-full bg-secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Cards grid */}
            {carousel.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No cards yet. Click "Add Card" to add the first one.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {carousel.items.map((item) => (
                  <CarouselItemCard
                    key={item.id}
                    item={item}
                    onUpdate={(d) => onUpdateItem({ id: item.id, ...d })}
                    onDelete={() => onDeleteItem(item.id)}
                    isPending={isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual card in the builder (shows image + edit inline)
// ─────────────────────────────────────────────────────────────
function CarouselItemCard({
  item,
  onUpdate,
  onDelete,
  isPending,
}: {
  item: CarouselItem;
  onUpdate: (d: { title?: string; subtitle?: string | null; image_url?: string; link_url?: string }) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    title: item.title,
    subtitle: item.subtitle ?? "",
    image_url: item.image_url,
    link_url: item.link_url,
  });

  if (editing) {
    return (
      <div className="bg-secondary/60 border border-border rounded-xl p-3 space-y-2 text-xs">
        <input
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="Title"
          className="w-full px-2 py-1 rounded bg-background border border-border"
        />
        <input
          value={f.subtitle}
          onChange={(e) => setF({ ...f, subtitle: e.target.value })}
          placeholder="Subtitle"
          className="w-full px-2 py-1 rounded bg-background border border-border"
        />
        <input
          value={f.image_url}
          onChange={(e) => setF({ ...f, image_url: e.target.value })}
          placeholder="Image URL"
          className="w-full px-2 py-1 rounded bg-background border border-border font-mono"
        />
        <input
          value={f.link_url}
          onChange={(e) => setF({ ...f, link_url: e.target.value })}
          placeholder="Link URL"
          className="w-full px-2 py-1 rounded bg-background border border-border font-mono"
        />
        {f.image_url && (
          <img
            src={f.image_url}
            alt="preview"
            className="w-full aspect-square rounded object-cover bg-card"
            onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")}
          />
        )}
        <div className="flex gap-1">
          <button
            disabled={!f.title.trim() || !f.image_url.trim() || !f.link_url.trim() || isPending}
            onClick={() => {
              onUpdate({
                title: f.title.trim(),
                subtitle: f.subtitle.trim() || null,
                image_url: f.image_url.trim(),
                link_url: f.link_url.trim(),
              });
              setEditing(false);
            }}
            className="flex-1 py-1 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40"
          >
            <Save className="size-3 inline mr-1" />Save
          </button>
          <button onClick={() => setEditing(false)} className="py-1 px-2 rounded bg-secondary">
            <X className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative bg-secondary/40 border border-border rounded-xl overflow-hidden">
      <img
        src={item.image_url}
        alt={item.title}
        className="w-full aspect-square object-cover"
        onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")}
      />
      <div className="p-2">
        <p className="text-xs font-semibold truncate">{item.title}</p>
        {item.subtitle && (
          <p className="text-[10px] text-muted-foreground truncate">{item.subtitle}</p>
        )}
        <p className="text-[10px] text-primary/70 truncate mt-0.5 flex items-center gap-0.5">
          <LinkIcon className="size-2.5" />{item.link_url}
        </p>
      </div>
      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold"
        >
          Edit
        </button>
        <button
          onClick={() => { if (confirm("Remove this card?")) onDelete(); }}
          disabled={isPending}
          className="p-1.5 rounded bg-destructive/80 text-white"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
