import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Trash2, Eye, EyeOff, GripVertical, ChevronDown, ChevronUp,
  Link as LinkIcon, Image as ImageIcon, Save, X, Upload, Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAllHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  type HeroCarouselSlide,
} from "@/lib/hero-carousel.functions";
import { uploadFileToBucket } from "@/lib/storage";

/**
 * HeroCarouselBuilder — full CRUD UI for managing hero carousel slides.
 * Used in the Admin panel for editing the homepage hero section.
 */
export function HeroCarouselBuilder() {
  const qc = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);

  const getAllFn = useServerFn(getAllHeroSlides);
  const createFn = useServerFn(createHeroSlide);
  const updateFn = useServerFn(updateHeroSlide);
  const deleteFn = useServerFn(deleteHeroSlide);

  const { data: slides, isLoading } = useQuery({
    queryKey: ["all-hero-slides"],
    queryFn: () => getAllFn(),
    retry: 1,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["all-hero-slides"] });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("🎬 Hero slide created successfully!");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => { toast.success("✨ Hero slide updated successfully!"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => { toast.success("🗑️ Hero slide deleted successfully!"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <div className="text-muted-foreground py-8 text-center">Loading hero slides…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Hero Carousel</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full-width hero section with auto-rotating slides. Each slide has an image/video, title, description, and call-to-action button.
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus className="size-4" /> New Slide
        </button>
      </div>

      {/* New slide form */}
      {showNewForm && (
        <HeroSlideForm
          onSave={(data) => {
            createM.mutate(data);
            setShowNewForm(false);
          }}
          onCancel={() => setShowNewForm(false)}
          isPending={createM.isPending}
        />
      )}

      {/* Existing slides list */}
      {(!slides || slides.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="size-8 mx-auto mb-3 opacity-30" />
          <p>No hero slides yet. Create your first one above.</p>
        </div>
      )}

      {(slides ?? []).map((slide, idx) => (
        <HeroSlideCard
          key={slide.id}
          slide={slide}
          idx={idx}
          totalCount={slides?.length ?? 0}
          onToggleActive={() =>
            updateM.mutate({ id: slide.id, active: !slide.active })
          }
          onMoveUp={() =>
            updateM.mutate({ id: slide.id, position: Math.max(0, slide.position - 1) })
          }
          onMoveDown={() =>
            updateM.mutate({ id: slide.id, position: slide.position + 1 })
          }
          onDelete={() => {
            if (!confirm(`Delete slide "${slide.title}"?`)) return;
            deleteM.mutate({ id: slide.id });
          }}
          onUpdate={(d) => updateM.mutate({ id: slide.id, ...d })}
          isPending={updateM.isPending || deleteM.isPending}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual slide card (collapsible)
// ─────────────────────────────────────────────────────────────
function HeroSlideCard({
  slide,
  idx,
  totalCount,
  onToggleActive,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdate,
  isPending,
}: {
  slide: HeroCarouselSlide;
  idx: number;
  totalCount: number;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (d: any) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: slide.title,
    description: slide.description,
    image_url: slide.image_url,
    video_url: slide.video_url ?? "",
    cta_text: slide.cta_text,
    cta_link: slide.cta_link,
  });

  const handleSave = () => {
    onUpdate({
      title: formData.title,
      description: formData.description,
      image_url: formData.image_url,
      video_url: formData.video_url || null,
      cta_text: formData.cta_text,
      cta_link: formData.cta_link,
    });
    setEditing(false);
  };

  return (
    <div
      className={`bg-card border rounded-2xl overflow-hidden transition-all ${
        slide.active ? "border-border" : "border-border opacity-60"
      }`}
    >
      {/* Slide header row */}
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

        {/* Thumbnail */}
        <img
          src={slide.image_url}
          alt={slide.title}
          className="w-16 h-10 rounded object-cover bg-secondary"
        />

        {/* Title summary */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{slide.title}</p>
          <p className="text-xs text-muted-foreground">
            {slide.description.slice(0, 50)}...
            {!slide.active ? " · Hidden" : ""}
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={onToggleActive}
          disabled={isPending}
          title={slide.active ? "Hide slide" : "Show slide"}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {slide.active ? <Eye className="size-4" /> : <EyeOff className="size-4 opacity-50" />}
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
          title="Delete slide"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-5">
          {editing ? (
            <HeroSlideForm
              initialData={formData}
              onSave={(data) => {
                onUpdate(data);
                setEditing(false);
              }}
              onCancel={() => {
                setEditing(false);
                setFormData({
                  title: slide.title,
                  description: slide.description,
                  image_url: slide.image_url,
                  video_url: slide.video_url ?? "",
                  cta_text: slide.cta_text,
                  cta_link: slide.cta_link,
                });
              }}
              isPending={isPending}
            />
          ) : (
            <div className="space-y-4">
              <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Slide Preview
                </h4>
                <img
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full aspect-video rounded-lg object-cover"
                />
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Title:</span>
                    <p className="text-sm font-medium">{slide.title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Description:</span>
                    <p className="text-sm">{slide.description}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">CTA:</span>
                    <p className="text-sm font-medium">{slide.cta_text} → {slide.cta_link}</p>
                  </div>
                  {slide.video_url && (
                    <div>
                      <span className="text-xs text-muted-foreground">Video:</span>
                      <p className="text-sm text-primary">{slide.video_url}</p>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
              >
                Edit Slide
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Slide form (create/edit)
// ─────────────────────────────────────────────────────────────
function HeroSlideForm({
  initialData,
  onSave,
  onCancel,
  isPending,
}: {
  initialData?: {
    title: string;
    description: string;
    image_url: string;
    video_url: string;
    cta_text: string;
    cta_link: string;
  };
  onSave: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState(
    initialData || {
      title: "",
      description: "",
      image_url: "",
      video_url: "",
      cta_text: "",
      cta_link: "",
    }
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    initialData?.image_url || null
  );

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const imageUrl = await uploadFileToBucket("hero-images", "uploads", file);
      setFormData({ ...formData, image_url: imageUrl });
      toast.success("🖼️ Image uploaded successfully!");
    } catch (error) {
      toast.error("Failed to upload image");
      console.error(error);
    }
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.image_url.trim() || !formData.cta_text.trim() || !formData.cta_link.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    onSave({
      title: formData.title.trim(),
      description: formData.description.trim(),
      image_url: formData.image_url.trim(),
      video_url: formData.video_url.trim() || undefined,
      cta_text: formData.cta_text.trim(),
      cta_link: formData.cta_link.trim(),
    });
  };

  return (
    <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-4">
      <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">
        {initialData ? "Edit Slide" : "New Slide"}
      </h3>
      
      {/* Image Upload */}
      <div>
        <label className="block text-xs text-muted-foreground mb-2">Background Image *</label>
        <div className="flex gap-4">
          <div className="relative w-48 h-28 rounded-lg overflow-hidden bg-secondary border border-border">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                No image
              </div>
            )}
          </div>
          <div className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-accent text-sm cursor-pointer"
            >
              <Upload className="size-4" />
              Upload Image
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Or paste URL below
            </p>
          </div>
        </div>
        <input
          type="text"
          placeholder="https://example.com/image.jpg"
          value={formData.image_url}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          className="w-full mt-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-mono"
        />
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-muted-foreground mb-2">Title *</label>
        <input
          placeholder="e.g. New Album Release"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-muted-foreground mb-2">Description *</label>
        <textarea
          placeholder="Short description of the slide content"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm resize-none"
        />
      </div>

      {/* Video URL (optional) */}
      <div>
        <label className="block text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Video className="size-3" /> Video URL (optional)
        </label>
        <input
          placeholder="YouTube or other video embed URL"
          value={formData.video_url}
          onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          If provided, video will be used as background instead of image
        </p>
      </div>

      {/* CTA */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-2">CTA Button Text *</label>
          <input
            placeholder="e.g. Listen Now"
            value={formData.cta_text}
            onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <LinkIcon className="size-3" /> CTA Link *
          </label>
          <input
            placeholder="/albums/uuid or https://..."
            value={formData.cta_link}
            onChange={(e) => setFormData({ ...formData, cta_link: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
        >
          {isPending ? "Saving…" : initialData ? "Update Slide" : "Create Slide"}
        </button>
        <button
          onClick={onCancel}
          disabled={isPending}
          className="px-4 py-2 rounded-full bg-secondary text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
