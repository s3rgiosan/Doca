import { describe, expect, it } from "vitest";
import { placeMenu } from "@/lib/ui/place-menu";

const viewport = { width: 1000, height: 800 };
const menu = { width: 240, height: 200 };
const trigger = { top: 100, left: 500, width: 34, height: 34 };

describe("placeMenu", () => {
  it("opens below the anchor with the right edges aligned", () => {
    expect(placeMenu(trigger, menu, viewport)).toEqual({ top: 138, left: 294 });
  });

  it("opens above the anchor when the bottom would overflow", () => {
    const low = { ...trigger, top: 700 };
    expect(placeMenu(low, menu, viewport)).toEqual({ top: 496, left: 294 });
  });

  it("stays below when there is no room above either", () => {
    const tiny = { width: 1000, height: 150 };
    const result = placeMenu({ ...trigger, top: 60 }, menu, tiny);
    expect(result.top).toBe(8);
  });

  it("clamps to the right edge", () => {
    expect(placeMenu({ ...trigger, left: 990 }, menu, viewport).left).toBe(752);
  });

  it("clamps to the left edge", () => {
    expect(placeMenu({ ...trigger, left: 10 }, menu, viewport).left).toBe(8);
  });
});
