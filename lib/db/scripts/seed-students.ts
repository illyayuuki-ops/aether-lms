import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQL_FILE = path.resolve(
  __dirname,
  "../../../attached_assets/aether_lms_db_1774991005413.sql"
);

function parseStudentRows(content: string): Array<{
  studentId: string;
  name: string;
  degree: string;
  major: string | null;
  yearLevel: string;
  isActive: boolean;
}> {
  const students: ReturnType<typeof parseStudentRows> = [];

  const rowRegex =
    /\(\d+,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(active|inactive)',\s*'[^']*'\)/g;

  let match;
  while ((match = rowRegex.exec(content)) !== null) {
    const [, studentId, name, degree, major, yearLevel, status] = match;

    if (studentId === "student_id") continue;
    if (!studentId || !name || studentId.length < 3) continue;

    students.push({
      studentId: studentId.trim(),
      name: name.trim(),
      degree: degree.trim() || "N/A",
      major:
        major.trim() === "NONE" || major.trim() === ""
          ? null
          : major.trim(),
      yearLevel: yearLevel.trim() || "1",
      isActive: status === "active",
    });
  }

  return students;
}

async function main() {
  console.log("Reading SQL file...");
  const content = fs.readFileSync(SQL_FILE, "utf-8");

  console.log("Parsing student records...");
  const students = parseStudentRows(content);
  console.log(`Found ${students.length} students to import`);

  if (students.length === 0) {
    console.log("No students found. Exiting.");
    await pool.end();
    return;
  }

  await pool.query("DELETE FROM students WHERE 1=1");
  console.log("Cleared existing students table");

  const batchSize = 100;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);

    // 8 columns now: student_id, name, degree, major, year_level,
    //                password, must_change_password, is_active
    const values = batch
      .map((_, idx) => {
        const base = idx * 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${
          base + 5
        }, $${base + 6}, $${base + 7}, $${base + 8})`;
      })
      .join(",\n");

    const params: any[] = [];
    for (const s of batch) {
      params.push(
        s.studentId,
        s.name,
        s.degree,
        s.major,
        s.yearLevel,
        s.studentId, // default password = studentId
        false,       // mustChangePassword = false
        s.isActive
      );
    }

    try {
      await pool.query(
        `INSERT INTO students
           (student_id, name, degree, major, year_level,
            password, must_change_password, is_active)
         VALUES ${values}
         ON CONFLICT (student_id) DO UPDATE SET
           name                 = EXCLUDED.name,
           degree               = EXCLUDED.degree,
           major                = EXCLUDED.major,
           year_level           = EXCLUDED.year_level,
           password             = EXCLUDED.password,
           must_change_password = EXCLUDED.must_change_password,
           is_active            = EXCLUDED.is_active,
           updated_at           = NOW()`,
        params
      );
      imported += batch.length;
    } catch (err: any) {
      console.error(`Batch error at offset ${i}:`, err.message);
      skipped += batch.length;
    }
  }

  console.log(
    `✅ Import complete: ${imported} students imported, ${skipped} skipped`
  );
  console.log(
    `ℹ️  Default password for all students = their Student ID.`
  );
  console.log(
    `   Librarian can reset individual passwords from the admin dashboard.`
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});