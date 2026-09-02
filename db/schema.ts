import { sql } from 'drizzle-orm';
import { check, index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable(
  'listings',
  {
    id: text('id').primaryKey(),
    imageUrl: text('image_url').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    condition: text('condition').notNull(),
    price: real('price').notNull(),
    aiDraft: text('ai_draft'),
    status: text('status').notNull().default('published'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    check('listings_title_length', sql`length(${table.title}) <= 70`),
    check('listings_description_length', sql`length(${table.description}) <= 1000`),
    check('listings_positive_price', sql`${table.price} > 0`),
    index('idx_listings_created_at').on(table.createdAt),
  ],
);
