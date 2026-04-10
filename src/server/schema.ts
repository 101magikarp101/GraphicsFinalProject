import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  z: real("z").notNull(),
});
