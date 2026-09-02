import { env } from 'cloudflare:workers';
import { getListings, insertListing } from '@/lib/listing-store';
import { CATEGORIES, CONDITIONS, type Category, type Condition, type Listing } from '@/lib/listings';

export const runtime = 'edge';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export async function GET() {
  try {
    return Response.json({ listings: await getListings() });
  } catch (error) {
    console.error('Feed route failed', error);
    return Response.json({ error: 'Nepavyko įkelti skelbimų.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get('image');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const category = String(formData.get('category') ?? '') as Category;
  const condition = String(formData.get('condition') ?? '') as Condition;
  const price = Number(formData.get('price'));
  const aiDraft = String(formData.get('aiDraft') ?? '') || null;

  if (!(image instanceof File)) return Response.json({ error: 'Trūksta nuotraukos.' }, { status: 400 });
  if (!MIME_EXTENSIONS[image.type] || image.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'Netinkamas nuotraukos failas.' }, { status: 400 });
  }
  if (!title || title.length > 70 || !description || description.length > 1000 || !Number.isFinite(price) || price <= 0) {
    return Response.json({ error: 'Patikrinkite įvestus duomenis.' }, { status: 400 });
  }
  if (!CATEGORIES.includes(category) || !CONDITIONS.includes(condition)) {
    return Response.json({ error: 'Netinkama kategorija arba būklė.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const key = `listings/${id}.${MIME_EXTENSIONS[image.type]}`;
  const listing: Listing = {
    id,
    imageUrl: `/api/images/${key}`,
    title,
    description,
    category,
    condition,
    price: Math.round(price * 100) / 100,
    createdAt: new Date().toISOString(),
  };

  await env.FILES.put(key, await image.arrayBuffer(), {
    httpMetadata: { contentType: image.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  try {
    await insertListing({ ...listing, aiDraft });
    return Response.json(listing, { status: 201 });
  } catch (error) {
    await env.FILES.delete(key);
    console.error('Publish route failed', error);
    return Response.json({ error: 'Nepavyko paskelbti skelbimo.' }, { status: 500 });
  }
}
