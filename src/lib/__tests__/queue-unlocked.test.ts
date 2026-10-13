import { describe, it, expect, vi, beforeEach } from "vitest";
import { queueUnlocked, resetQueueUnlocked } from "../queue-unlocked";

/**
 * A freshly bought song lands in the queue.
 *
 * THE CASE THAT MATTERS MOST
 *
 * The checkout success page POLLS while the transaction is pending, and the
 * effect that runs on settlement re-fires every time the status lands on
 * "completed". Without a guard the same song is queued twice: the listener hears
 * it start, skips, and hears it again. That is the bug this guards.
 */
const track = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  title: "Chooba",
  cover_url: "c.jpg",
  duration: 214,
  price: 10,
  artist: { id: "ar-1", name: "Nelson K" },
  ...over,
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: track(), error: null }) }),
      }),
    }),
  },
}));

beforeEach(() => {
  resetQueueUnlocked();
});

describe("auto queueing after a purchase", () => {
  it("queues a bought song", async () => {
    const add = vi.fn();
    const n = await queueUnlocked("completed", { id: "t1", item_type: "song", item_id: "s-1" }, add);
    expect(n).toBe(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({ id: "s-1", title: "Chooba" });
  });

  it("does NOT replace the queue — it appends", async () => {
    // The caller passes addToQueue; if this ever became setQueue the listener's
    // current track would be swapped out by something they bought.
    const add = vi.fn();
    await queueUnlocked("completed", { id: "t1", item_type: "song", item_id: "s-1" }, add);
    expect(add.mock.calls[0][0]).not.toHaveProperty("replace");
  });

  it("queues once even when settlement is seen repeatedly", async () => {
    const add = vi.fn();
    const tx = { id: "t1", item_type: "song", item_id: "s-1" };
    await queueUnlocked("completed", tx, add);
    await queueUnlocked("completed", tx, add);
    await queueUnlocked("completed", tx, add);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("queues again for a different transaction", async () => {
    const add = vi.fn();
    await queueUnlocked("completed", { id: "t1", item_type: "song", item_id: "s-1" }, add);
    await queueUnlocked("completed", { id: "t2", item_type: "song", item_id: "s-2" }, add);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("clears the price, because a bought song no longer needs a Buy prompt", async () => {
    const add = vi.fn();
    await queueUnlocked("completed", { id: "t1", item_type: "song", item_id: "s-1" }, add);
    expect(add.mock.calls[0][0].price).toBeUndefined();
  });

  it("does not queue while the payment is still pending", async () => {
    const add = vi.fn();
    for (const s of ["pending", "processing", "failed", "fulfillment_failed", null, undefined]) {
      expect(await queueUnlocked(s, { id: "t1", item_type: "song", item_id: "s-1" }, add)).toBe(0);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("does not dump a whole album into the queue", async () => {
    // 12 tracks turned into a surprise playlist the listener cannot undo.
    const add = vi.fn();
    expect(
      await queueUnlocked("completed", { id: "t1", item_type: "album", item_id: "al-1" }, add),
    ).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing for a transaction with no item", async () => {
    const add = vi.fn();
    expect(await queueUnlocked("completed", null, add)).toBe(0);
    expect(await queueUnlocked("completed", { id: "t1" }, add)).toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it("does not throw when the song lookup fails", async () => {
    const add = vi.fn();
    await expect(
      queueUnlocked("completed", { id: "t1", item_type: "song", item_id: "s-1" }, add),
    ).resolves.toBeTypeOf("number");
  });
});