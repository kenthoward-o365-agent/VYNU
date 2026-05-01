/**
 * Load-test seeder. Creates LOADTEST_* venues with menu, tables, and
 * pricing rules so k6 has realistic targets to hit.
 *
 * Usage:
 *   bun run scripts/loadtest/seed.ts --count 1000
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 * Writes the resulting venue IDs to scripts/loadtest/.venue-ids
 * (comma-separated) for k6 to consume via -e VENUE_IDS=$(cat ...).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const COUNT = Number(args.get("count") ?? 50);
const TABLES_PER_VENUE = Number(args.get("tables") ?? 20);
const ITEMS_PER_VENUE = Number(args.get("items") ?? 60);

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function chunkInsert<T>(table: string, rows: T[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await admin.from(table).insert(slice as any);
    if (error) throw new Error(`${table} insert failed @${i}: ${error.message}`);
  }
}

async function main() {
  console.log(`Seeding ${COUNT} LOADTEST venues...`);
  const venues = Array.from({ length: COUNT }, (_, i) => ({
    name: `LOADTEST_Venue_${Date.now()}_${i}`,
    slug: `loadtest-${Date.now()}-${i}`,
    is_active: true,
  }));
  const { data: createdVenues, error } = await admin
    .from("venues")
    .insert(venues)
    .select("id");
  if (error) throw error;
  const venueIds = createdVenues!.map((v) => v.id as string);
  console.log(`Created ${venueIds.length} venues`);

  const allTables = venueIds.flatMap((vid) =>
    Array.from({ length: TABLES_PER_VENUE }, (_, t) => ({
      venue_id: vid,
      table_number: String(t + 1),
      seats: 4,
    })),
  );
  await chunkInsert("tables", allTables);
  console.log(`Created ${allTables.length} tables`);

  const allItems = venueIds.flatMap((vid) =>
    Array.from({ length: ITEMS_PER_VENUE }, (_, n) => ({
      venue_id: vid,
      name: `LOADTEST Item ${n + 1}`,
      price: 1000 + (n % 30) * 100,
      is_available: true,
    })),
  );
  await chunkInsert("menu_items", allItems);
  console.log(`Created ${allItems.length} menu items`);

  const outPath = join(process.cwd(), "scripts/loadtest/.venue-ids");
  writeFileSync(outPath, venueIds.join(","), "utf8");
  console.log(`Wrote ${venueIds.length} venue IDs → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
