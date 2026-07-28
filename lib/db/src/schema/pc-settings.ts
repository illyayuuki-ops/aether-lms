import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Stores admin-assigned PC Number → IP Address mappings.
// Used by the kiosk to auto-detect its own PC number based on the client IP.
export const pcSettingsTable = pgTable("pc_settings", {
  id: serial("id").primaryKey(),
  pcNumber: integer("pc_number").notNull().unique(),
  ipAddress: text("ip_address").notNull(),         // e.g. "192.168.1.101"
  label: text("label"),                            // optional friendly name e.g. "Library PC 1"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PcSetting = typeof pcSettingsTable.$inferSelect;
export type InsertPcSetting = typeof pcSettingsTable.$inferInsert;