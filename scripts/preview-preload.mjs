/**
 * Preview preload — swaps the `pg` driver for an in-memory Postgres (pg-mem)
 * and seeds it, so the real API can be reviewed without installing PostgreSQL.
 *
 * Used only by `pnpm preview:reports`. Production uses DATABASE_URL + real pg.
 *
 *   node --import ./scripts/preview-preload.mjs artifacts/api-server/dist/index.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { newDb } = require("pg-mem");

const mem = newDb({ autoCreateForeignKeyIndices: true });
mem.public.registerFunction({ name: "version", returns: "text", implementation: () => "PostgreSQL 16.0 (pg-mem)" });

// scripts/pg-shim.mjs (installed via scripts/preview-loaders.mjs) reads this.
globalThis.__pgMem = mem;

// ── Schema (mirrors lib/db/src/schema) ──────────────────────────────────────
mem.public.none(`
  CREATE TABLE admins (
    id serial PRIMARY KEY, username text NOT NULL UNIQUE, password text NOT NULL,
    role text NOT NULL DEFAULT 'librarian', is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE students (
    id serial PRIMARY KEY, student_id text NOT NULL UNIQUE, name text NOT NULL,
    degree text NOT NULL DEFAULT '', major text, year_level text NOT NULL DEFAULT '1',
    password text NOT NULL DEFAULT '', must_change_password boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE sessions (
    id serial PRIMARY KEY, student_id text NOT NULL, name text NOT NULL,
    degree text NOT NULL DEFAULT '', year_level text NOT NULL DEFAULT '1',
    computer_number integer NOT NULL, research_topic text,
    login_time timestamptz NOT NULL DEFAULT now(), logout_time timestamptz,
    last_activity timestamptz NOT NULL DEFAULT now(), duration_minutes integer,
    logout_reason text, is_active boolean NOT NULL DEFAULT true,
    session_token text NOT NULL DEFAULT ''
  );
  CREATE TABLE pc_settings (
    id serial PRIMARY KEY, pc_number integer NOT NULL UNIQUE, ip_address text NOT NULL,
    label text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

// ── Deterministic synthetic data ────────────────────────────────────────────
let s = 20261106;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const COURSES = ["BSIT", "BSED", "BSBA", "BSHM", "BSA", "BSTM", "BEED", "BSIE"];
const YEARS = ["1", "2", "3", "4"];
const FIRST = ["Maria", "Jose", "Ana", "Juan", "Liza", "Carlo", "Nina", "Paolo", "Rosa", "Mark", "Ella", "Rico", "Sofia", "Ben", "Kai", "Joy", "Dan", "Bea", "Leo", "Mia", "Angelo", "Grace"];
const LAST = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino", "Del Rosario", "Villanueva", "Navarro", "Dizon", "Bañon", "Muñoz"];

const students = [];
const studentRows = [];
for (let i = 0; i < 640; i++) {
  const id = `2${ri(0, 5)}-${String(10000 + i).padStart(5, "0")}`;
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const degree = pick(COURSES);
  const year = pick(YEARS);
  students.push([id, name, degree, year]);
  studentRows.push(`(${q(id)},${q(name)},${q(degree)},${q(year)},'x')`);
}
mem.public.none(
  `INSERT INTO students (student_id, name, degree, year_level, password) VALUES ${studentRows.join(",")};`,
);
// bcrypt hash of MASTER_ADMIN_PASSWORD ("admin123") — the login route compares with bcrypt.
mem.public.none(
  `INSERT INTO admins (username, password, role) VALUES ('admin','$2b$10$Y7zrguHNGakfCjTwt6Qreukz4wCEk/ZhmzY5YEq0QkcziO6mGXt6q','super_admin');`,
);
for (let pc = 1; pc <= 20; pc++) {
  mem.public.none(`INSERT INTO pc_settings (pc_number, ip_address, label) VALUES (${pc},'192.168.1.${100 + pc}','Library PC ${pc}');`);
}

// 150 days of sessions, weighted to class hours, with a term-long ramp.
const TZ_MIN = 8 * 60;
const now = Date.now();
const sessions = [];
for (let back = 150; back >= 0; back--) {
  const day = new Date(now - back * 86_400_000 + TZ_MIN * 60_000);
  const wd = day.getUTCDay();
  if ((wd === 0 || wd === 6) && rnd() > 0.12) continue;
  const factor = wd === 2 || wd === 3 ? 1.25 : wd === 1 || wd === 4 ? 1.0 : 0.55;
  const growth = 0.55 + (1 - back / 150) * 0.75;
  const count = Math.round(ri(14, 42) * factor * growth);

  for (let k = 0; k < count; k++) {
    const st = students[Math.floor(rnd() * students.length)];
    const r = rnd();
    const hour = r < 0.16 ? 8 : r < 0.34 ? 9 : r < 0.48 ? 10 : r < 0.58 ? 11 : r < 0.68 ? 13 : r < 0.82 ? 14 : r < 0.92 ? 15 : 16;
    const minute = ri(0, 59);
    const dr = rnd();
    const duration = dr < 0.08 ? 0 : dr < 0.30 ? ri(5, 20) : dr < 0.72 ? ri(21, 60) : dr < 0.95 ? ri(61, 120) : ri(121, 240);
    const loginMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute) - TZ_MIN * 60_000;
    const logoutMs = loginMs + duration * 60_000;
    const reason = rnd() < 0.72 ? "manual" : rnd() < 0.72 ? "inactivity" : rnd() < 0.7 ? "time_limit" : "admin";
    const active = back === 0 && rnd() < 0.03;

    const iso = (ms) => `'${new Date(ms).toISOString()}'`;
    sessions.push(
      `(${q(st[0])},${q(st[1])},${q(st[2])},${q(st[3])},${ri(1, 20)},` +
        `${iso(loginMs)},${active ? "NULL" : iso(logoutMs)},` +
        `${iso(loginMs)},${active ? "NULL" : duration},${active ? "NULL" : q(reason)},${active})`,
    );
  }
}
for (let i = 0; i < sessions.length; i += 500) {
  mem.public.none(
    `INSERT INTO sessions (student_id,name,degree,year_level,computer_number,login_time,logout_time,last_activity,duration_minutes,logout_reason,is_active) VALUES ${sessions.slice(i, i + 500).join(",")};`,
  );
}

console.log(`[preview] seeded 640 students, ${sessions.length} sessions, 20 PCs (in-memory)`);
