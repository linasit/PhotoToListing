import { list, put } from '@vercel/blob';
import type { Listing } from '@/lib/listings';

const RECORDS_PREFIX = 'listing-records/';

type StoredListing = Listing & { aiDraft: string | null };

function storageReady() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readListing(url: string): Promise<StoredListing | null> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as StoredListing;
}

export async function getListings(limit = 48): Promise<Listing[]> {
  if (!storageReady()) return [];
  const { blobs } = await list({ prefix: RECORDS_PREFIX, limit: 1000 });
  const records = await Promise.all(blobs.map((blob) => readListing(blob.url)));
  return records
    .filter((record): record is StoredListing => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getListing(id: string): Promise<Listing | null> {
  if (!storageReady()) return null;
  const { blobs } = await list({ prefix: `${RECORDS_PREFIX}${id}.json`, limit: 1 });
  return blobs[0] ? readListing(blobs[0].url) : null;
}

export async function insertListing(input: Listing & { aiDraft: string | null }) {
  await put(`${RECORDS_PREFIX}${input.id}.json`, JSON.stringify(input), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  return input;
}
