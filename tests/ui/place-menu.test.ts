import { describe, expect, it } from "vitest";
import { placeMenu } from "@/lib/ui/place-menu";

const viewport = { width: 1000, height: 800 };
const menu = { width: 240, height: 200 };
const row = { top: 100, left: 0, width: 280, height: 40 };

describe("placeMenu", () => {
  it("opens below the anchor, inset from its left edge", () => {
    expect(placeMenu(row, menu, viewport)).toEqual({ top: 144, left: 10 });
  });

  it("opens above the anchor when the bottom would overflow", () => {
    const low = { ...row, top: 700 };
    expect(placeMenu(low, menu, viewport)).toEqual({ top: 496, left: 10 });
  });

  it("stays below when there is no room above either", () => {
    const tiny = { width: 1000, height: 150 };
    const result = placeMenu({ ...row, top: 60 }, menu, tiny);
    expect(result.top).toBe(8);
  });

  it("clamps to the right edge", () => {
    expect(placeMenu({ ...row, left: 900 }, menu, viewport).left).toBe(752);
  });

  it("clamps to the left edge", () => {
    expect(placeMenu({ ...row, left: -50 }, menu, viewport).left).toBe(8);
  });
});
