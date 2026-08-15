import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const traceReviews = sqliteTable("trace_reviews", {
  traceId: text("trace_id").primaryKey(),
  scoresJson: text("scores_json").notNull().default("{}"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const traceAnnotations = sqliteTable("trace_annotations", {
  id: text("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  assetRole: text("asset_role").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("trace_annotations_trace_id_idx").on(table.traceId),
]);
