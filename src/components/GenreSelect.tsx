import { MUSIC_GENRES } from "@/lib/genres";

interface GenreSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

/**
 * The single genre picker for the whole app (upload wizard, artist
 * profile, applications, album edit). One canonical list means no more
 * duplicate categories like "Gospel" vs "gospel".
 */
export function GenreSelect({ value, onChange, id, className }: GenreSelectProps) {
  return (
    <select
      id={id}
      value={MUSIC_GENRES.includes(value as any) ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "mt-1 w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
      }
    >
      <option value="">— Pick a category —</option>
      {MUSIC_GENRES.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}
