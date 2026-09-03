import { list, put } from '@vercel/blob';
import type { Listing } from '@/lib/listings';

const RECORDS_PREFIX = 'listing-records/';

type StoredListing = Listing & { aiDraft: string | null };

type EditableStoredListing = StoredListing & { editTokenHash?: string };

type ListingUpdate = Pick<
  Listing,
  'title' | 'description' | 'category' | 'condition' | 'price'
>;

export type UpdateListingResult =
  | { status: 'updated'; listing: Listing }
  | { status: 'not_found' }
  | { status: 'forbidden' };

function storageReady() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readListing(url: string): Promise<EditableStoredListing | null> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as EditableStoredListing;
}

function toPublicListing(record: EditableStoredListing): Listing {
  return {
    id: record.id,
    imageUrl: record.imageUrl,
    title: record.title,
    description: record.description,
    category: record.category,
    condition: record.condition,
    price: record.price,
    createdAt: record.createdAt,
  };
}

async function getStoredListing(
  id: string,
): Promise<EditableStoredListing | null> {
  if (!storageReady()) return null;
  const { blobs } = await list({
    prefix: `${RECORDS_PREFIX}${id}.json`,
    limit: 1,
  });
  return blobs[0] ? readListing(blobs[0].url) : null;
}

export async function getListings(limit = 48): Promise<Listing[]> {
  if (!storageReady()) return [];
  const { blobs } = await list({ prefix: RECORDS_PREFIX, limit: 1000 });
  const records = await Promise.all(blobs.map((blob) => readListing(blob.url)));
  return records
    .filter((record): record is EditableStoredListing => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(toPublicListing);
}

export async function getListing(id: string): Promise<Listing | null> {
  const listing = await getStoredListing(id);
  return listing ? toPublicListing(listing) : null;
}

export async function insertListing(
  input: StoredListing,
  editTokenHash: string,
) {
  await put(
    `${RECORDS_PREFIX}${input.id}.json`,
    JSON.stringify({ ...input, editTokenHash }),
    {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    },
  );
  return input;
}

export async function updateListing(
  id: string,
  input: ListingUpdate,
  editTokenHash: string,
): Promise<UpdateListingResult> {
  const current = await getStoredListing(id);
  if (!current) return { status: 'not_found' };
  if (!current.editTokenHash || current.editTokenHash !== editTokenHash)
    return { status: 'forbidden' };

  const updated: EditableStoredListing = { ...current, ...input };
  await put(`${RECORDS_PREFIX}${id}.json`, JSON.stringify(updated), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  return { status: 'updated', listing: toPublicListing(updated) };
}
