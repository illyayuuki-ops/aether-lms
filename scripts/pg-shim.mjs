/**
 * `pg` replacement backed by pg-mem — PREVIEW ONLY, never loaded in production.
 *
 * The in-memory database is created and seeded by preview-preload.mjs, which
 * runs as an --import hook before any application module loads.
 *
 * pg-mem's adapter is close to `pg`, but drizzle-orm/node-postgres needs three
 * things it does not implement. Each is translated here so that no application
 * code has to know the difference:
 *
 *   1. `pool.types.getTypeParser` — drizzle's driver calls it; pg-mem has no such
 *      object. A pass-through parser is supplied.
 *   2. The `types` option on a query — pg-mem *throws* if a query object carries
 *      it, so it is removed before the query reaches pg-mem.
 *   3. `rowMode: "array"` — drizzle asks for positional rows and maps them by
 *      index (mapResultRow uses row[columnIndex]). pg-mem always returns objects
 *      and rejects the option, so it is removed and the rows are converted back
 *      to arrays here, in select order.
 *
 * Column order comes from the keys of the returned rows: pg-mem builds each row
 * object by walking the select list in order, so Object.keys(row) is the same
 * order drizzle will map against.
 */
const mem = globalThis.__pgMem;
if (!mem) throw new Error("pg-shim: preview-preload.mjs must run first (use --import).");

const adapter = mem.adapters.createPg();

const identityParser = (value) => value;
const shimTypes = { getTypeParser: () => identityParser, setTypeParser: () => {} };

/** Object rows -> positional rows, in select order. */
function toPositional(rows) {
  if (rows.length === 0) return rows;
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return rows;
  return rows.map((row) => columns.map((column) => row[column]));
}

/**
 * Split drizzle's options from what pg-mem accepts, then restore array mode.
 * `rowMode` is dropped before running and re-applied to the result.
 */
async function runQuery(queryFn, args) {
  const [first, ...rest] = args;

  // `query(sql, values)` / `query(config)` — only the config form needs work.
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return queryFn(first, ...rest);
  }

  const { types: _types, rowMode, ...query } = first;
  const result = await queryFn(query, ...rest);

  if (rowMode !== "array") return result;
  return { ...result, rows: toPositional(result.rows), rowMode: "array", fields: [] };
}

class ShimPool extends adapter.Pool {
  constructor(...args) {
    super(...args);
    this.types = shimTypes;
  }

  query(...args) {
    // Bind through the adapter's own query so pg-mem internals still resolve.
    return runQuery((q, ...r) => super.query(q, ...r), args);
  }
}

class ShimClient extends adapter.Client {
  constructor(...args) {
    super(...args);
    this.types = shimTypes;
  }

  query(...args) {
    return runQuery((q, ...r) => super.query(q, ...r), args);
  }
}

export const Pool = ShimPool;
export const Client = ShimClient;
export const types = shimTypes;
export default { Pool, Client, types };
