import { env } from 'cloudflare:workers';
import type { Category, Condition, Listing } from '@/lib/listings';

type ListingRow = {
  id: string;
  image_url: string;
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  price: number;
  created_at: string;
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) <= 70),
      description TEXT NOT NULL CHECK (length(description) <= 1000),
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      price REAL NOT NULL CHECK (price > 0),
      ai_draft TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC)'),
    db.prepare('PRAGMA optimize'),
  ]);
  schemaReady = true;
}

function fromRow(row: ListingRow): Listing {
  return {
    id: row.id,
    imageUrl: row.image_url,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    price: Number(row.price),
    createdAt: row.created_at,
  };
}

export async function getListings(limit = 48): Promise<Listing[]> {
  await ensureSchema();
  const result = await env.DB.prepare(
    `SELECT id, image_url, title, description, category, condition, price, created_at
     FROM listings WHERE status = 'published' ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<ListingRow>();
  return result.results.map(fromRow);
}

export async function getListing(id: string): Promise<Listing | null> {
  await ensureSchema();
  const row = await env.DB.prepare(
    `SELECT id, image_url, title, description, category, condition, price, created_at
     FROM listings WHERE id = ? AND status = 'published' LIMIT 1`,
  )
    .bind(id)
    .first<ListingRow>();
  return row ? fromRow(row) : null;
}

export async function insertListing(input: Listing & { aiDraft: string | null }) {
  await ensureSchema();
  await env.DB.prepare(
    `INSERT INTO listings
      (id, image_url, title, description, category, condition, price, ai_draft, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
  )
    .bind(
      input.id,
      input.imageUrl,
      input.title,
      input.description,
      input.category,
      input.condition,
      input.price,
      input.aiDraft,
      input.createdAt,
    )
    .run();
  return input;
}
