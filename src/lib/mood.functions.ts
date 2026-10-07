import { createServerFn } from "@tanstack/react-start";

export type MoodPick = {
  id: string;
  title: string;
  cover_url: string | null;
  price: number | null;
  genre: string | null;
  artist: { id: string; name: string } | null;
  reason: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "picks"],
  properties: {
    summary: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "reason"],
        properties: { id: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
};

/** Recommend catalog songs for a described mood via Lovable AI Gateway. Public. */
export const recommendByMood = createServerFn({ method: "POST" })
  .validator((d: { prompt: string }) => {
    const prompt = String(d?.prompt ?? "")
      .trim()
      .slice(0, 600);
    if (prompt.length < 3) throw new Error("Tell us a bit more about your mood.");
    return { prompt };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured.");
    const { getPublicSupabase } = await import("./supabase-public.server");
    const supabase = getPublicSupabase();
    const { data: songs, error } = await supabase
      .from("songs")
      .select("id,title,genre,price,cover_url,explicit,play_count,artist:artists(id,name,genre)")
      .eq("status", "approved")
      .order("play_count", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const catalog = (songs ?? []) as any[];
    if (catalog.length === 0)
      return { summary: "The catalog is empty right now.", picks: [] as MoodPick[] };

    const lines = catalog
      .map(
        (s) =>
          `${s.id} | ${s.title} | ${s.artist?.name ?? "?"} | ${s.genre ?? s.artist?.genre ?? "-"}${s.explicit ? " | explicit" : ""}`,
      )
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "You are the Wesu+ music curator for a Zambian streaming app. Pick 6 to 10 songs ONLY from the catalog provided (use exact ids) that best match the listener's mood and preferences. Each reason is one short friendly sentence. summary is one sentence describing the vibe. Never invent songs.",
        input: `Listener: ${data.prompt}\n\nCatalog (id | title | artist | genre):\n${lines}`,
        text: { format: { type: "json_schema", name: "mood_picks", strict: true, schema: SCHEMA } },
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      let msg = "Recommendations are unavailable right now.";
      try {
        msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? msg;
      } catch {}
      if (res.status === 429) msg = "Too many requests — try again in a moment.";
      if (res.status === 402) msg = "AI credits are used up for now.";
      throw new Error(msg);
    }

    // Consume SSE server-side and collect the output text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
            if (ev.type === "response.refusal.delta") refused = true;
            if (ev.type === "response.failed" || ev.type === "error")
              throw new Error(ev.response?.error?.message ?? ev.message ?? "AI request failed");
          } catch (e) {
            if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
          }
        }
      }
    }
    if (refused) throw new Error("The curator couldn't help with that request.");

    let parsed: { summary: string; picks: { id: string; reason: string }[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Couldn't read the recommendations. Please try again.");
    }
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const picks: MoodPick[] = [];
    for (const p of parsed.picks ?? []) {
      const s = byId.get(p.id);
      if (!s || seen.has(p.id)) continue;
      seen.add(p.id);
      picks.push({
        id: s.id,
        title: s.title,
        cover_url: s.cover_url,
        price: s.price,
        genre: s.genre,
        artist: s.artist ? { id: s.artist.id, name: s.artist.name } : null,
        reason: String(p.reason ?? "").slice(0, 200),
      });
      if (picks.length >= 10) break;
    }
    return { summary: String(parsed.summary ?? ""), picks };
  });
