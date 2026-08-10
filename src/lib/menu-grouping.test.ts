/**
 * HLRDRNW-16 · AC3 — "Given menu categories, when browsing, then items are
 * grouped and navigable."
 *
 * Before this, MenuFeed rendered one flat list and used the category chips only
 * as a filter, so nothing was ever grouped. These cover the grouping itself and
 * the two ways it could regress: dropping items whose category is unknown, and
 * rendering headings for categories that have no items.
 */
import { describe, it, expect } from "vitest";
import {
  groupItemsByCategory,
  UNCATEGORISED_SECTION_ID,
  type GroupableCategory,
} from "./menu-grouping";

const item = (id: string, category_id: string | null) => ({ id, category_id });
const cat = (id: string, name: string): GroupableCategory => ({ id, name });

describe("groupItemsByCategory", () => {
  it("groups items under their category", () => {
    const sections = groupItemsByCategory(
      [item("a", "mains"), item("b", "drinks"), item("c", "mains")],
      [cat("mains", "Mains"), cat("drinks", "Drinks")],
    );

    expect(sections.map((s) => s.name)).toEqual(["Mains", "Drinks"]);
    expect(sections[0].items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(sections[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("follows the order of the categories array, not the items", () => {
    // get_menu_snapshot returns categories sorted by display_order, so the
    // venue's chosen order must win even though a Drinks item comes first.
    const sections = groupItemsByCategory(
      [item("a", "drinks"), item("b", "starters"), item("c", "mains")],
      [cat("starters", "Starters"), cat("mains", "Mains"), cat("drinks", "Drinks")],
    );
    expect(sections.map((s) => s.name)).toEqual(["Starters", "Mains", "Drinks"]);
  });

  it("preserves item order within a category", () => {
    const sections = groupItemsByCategory(
      [item("first", "mains"), item("second", "mains"), item("third", "mains")],
      [cat("mains", "Mains")],
    );
    expect(sections[0].items.map((i) => i.id)).toEqual(["first", "second", "third"]);
  });

  it("drops categories with no items — no bare 'Specials' heading", () => {
    const sections = groupItemsByCategory(
      [item("a", "mains")],
      [cat("mains", "Mains"), cat("specials", "Specials")],
    );
    expect(sections.map((s) => s.name)).toEqual(["Mains"]);
  });

  it("keeps items that have no category, in a trailing section", () => {
    const sections = groupItemsByCategory(
      [item("a", "mains"), item("loose", null)],
      [cat("mains", "Mains")],
    );
    expect(sections).toHaveLength(2);
    expect(sections[1].id).toBe(UNCATEGORISED_SECTION_ID);
    expect(sections[1].items.map((i) => i.id)).toEqual(["loose"]);
  });

  it("keeps items whose category the snapshot did not return", () => {
    // An item can point at a deactivated category, or one on another menu.
    // The old flat list still showed it, so it must not disappear.
    const sections = groupItemsByCategory(
      [item("a", "mains"), item("orphan", "deactivated-category")],
      [cat("mains", "Mains")],
    );
    expect(sections.flatMap((s) => s.items.map((i) => i.id))).toContain("orphan");
  });

  it("never loses an item", () => {
    const items = [
      item("a", "mains"),
      item("b", null),
      item("c", "unknown"),
      item("d", "drinks"),
    ];
    const sections = groupItemsByCategory(items, [
      cat("mains", "Mains"),
      cat("drinks", "Drinks"),
    ]);
    expect(sections.flatMap((s) => s.items)).toHaveLength(items.length);
  });

  it("returns nothing for an empty menu", () => {
    expect(groupItemsByCategory([], [cat("mains", "Mains")])).toEqual([]);
  });

  it("copes with a menu that has no categories at all", () => {
    const sections = groupItemsByCategory([item("a", null), item("b", null)], []);
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe(UNCATEGORISED_SECTION_ID);
    expect(sections[0].items).toHaveLength(2);
  });

  it("collapses to one section when a single category is pre-filtered", () => {
    // With a chip selected, MenuFeed passes only that category's items.
    const sections = groupItemsByCategory(
      [item("a", "drinks"), item("b", "drinks")],
      [cat("mains", "Mains"), cat("drinks", "Drinks")],
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Drinks");
  });
});
