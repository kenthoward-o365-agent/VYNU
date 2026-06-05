/**
 * Page through a Supabase REST query in chunks of `pageSize` and return the
 * full result set. Supabase silently caps single requests at 1000 rows; use
 * this for admin exports / lists that must include every row at scale.
 *
 * Usage:
 *   const rows = await paginate((from, to) =>
 *     supabase.from("venue_invoices").select("*").order("created_at").range(from, to)
 *   );
 */
export async function paginate<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  opts: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 100_000; // safety cap
  const out: T[] = [];
  let from = 0;
  while (out.length < maxRows) {
    const to = from + pageSize - 1;
    const { data, error } = await query(from, to);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
