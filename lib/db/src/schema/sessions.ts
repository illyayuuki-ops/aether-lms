import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  studentId: text("student_id").notNull(),
  name: text("name").notNull(),
  degree: text("degree").notNull().default(""),
  yearLevel: text("year_level").notNull().default("1"),
  computerNumber: integer("computer_number").notNull(),
  researchTopic: text("research_topic"),
  loginTime: timestamp("login_time", { withTimezone: true }).notNull().defaultNow(),
  logoutTime: timestamp("logout_time", { withTimezone: true }),
  lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
  durationMinutes: integer("duration_minutes"),
  logoutReason: text("logout_reason"),
  isActive: boolean("is_active").notNull().default(true),
  sessionToken: text("session_token").notNull().default(""),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  loginTime: true,
  lastActivity: true,
  isActive: true,
  sessionToken: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
