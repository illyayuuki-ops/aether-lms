import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  studentId: text("student_id").notNull().unique(),
  name: text("name").notNull(),
  degree: text("degree").notNull().default(""),
  major: text("major"),
  yearLevel: text("year_level").notNull().default("1"),
  // Password is stored as plain text for now.
  // Default is the student_id itself (e.g. "2021-00123").
  // Librarian can assign or reset it anytime from the admin dashboard.
  password: text("password").notNull().default(""),
  // If true, student will be prompted to change password on next login.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Student = typeof studentsTable.$inferSelect;
export type InsertStudent = typeof studentsTable.$inferInsert;