/**
 * HLRDRNW-16 · AC3 — grouping menu items into category sections for display.
 *
 * Lives outside MenuFeed so the component file only exports a component (the
 * repo's react-refresh lint rule), and so the logic can be unit tested without
 * rendering. Generic over the item type: it only needs `category_id`, which
 * keeps it decoupled from whichever MenuItem shape the caller holds.
 */

export interface GroupableCategory {
  id: string;
  name: string;
}

export interface MenuSection<T> {
  id: string;
  name: string;
  items: T[];
}

/** Bucket for items whose category the snapshot did not return. */
export const UNCATEGORISED_SECTION_ID = "__uncategorised__";

/** Heading for that bucket. Deliberately vague — it holds a mixed bag. */
export const UNCATEGORISED_SECTION_NAME = "More";

/**
 * Groups menu items into category sections.
 *
 * Category order follows the `categories` array, which get_menu_snapshot already
 * returns sorted by display_order — so the ordering is the venue's, not ours.
 *
 * Two rules worth stating, because both are easy to get wrong:
 *  - Empty categories are dropped. A venue with a "Specials" category and no
 *    specials today should not see a bare heading.
 *  - Items whose category_id is missing, or names a category the snapshot did
 *    not return (an inactive one, or one belonging to a different menu), land in
 *    a trailing catch-all section. They rendered fine in the previous flat list,
 *    so they must not silently vanish now that display is category-driven.
 */
export function groupItemsByCategory<T extends { category_id: string | null }>(
  items: T[],
  categories: GroupableCategory[],
): MenuSection<T>[] {
  const byCategory = new Map<string, T[]>();
  const orphans: T[] = [];
  const known = new Set(categories.map((c) => c.id));

  for (const item of items) {
    if (item.category_id && known.has(item.category_id)) {
      const bucket = byCategory.get(item.category_id);
      if (bucket) bucket.push(item);
      else byCategory.set(item.category_id, [item]);
    } else {
      orphans.push(item);
    }
  }

  const sections: MenuSection<T>[] = categories
    .filter((c) => byCategory.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, items: byCategory.get(c.id)! }));

  if (orphans.length > 0) {
    sections.push({
      id: UNCATEGORISED_SECTION_ID,
      name: UNCATEGORISED_SECTION_NAME,
      items: orphans,
    });
  }

  return sections;
}
