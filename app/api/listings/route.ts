import { del, put } from '@vercel/blob';
import { getListings, insertListing } from '@/lib/listing-store';
import {
  CATEGORIES,
  CONDITIONS,
  type Category,
  type Condition,
  type Listing,
} from '@/lib/listings';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

async function hashEditToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function GET() {
  try {
    return Response.json({ listings: await getListings() });
  } catch (error) {
    console.error('Feed route failed', error);
    return Response.json(
      { error: 'Nepavyko įkelti skelbimų.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'Nuotraukų saugykla dar neprijungta.' },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const image = formData.get('image');
  const title = formText(formData, 'title');
  const description = formText(formData, 'description');
  const category = formText(formData, 'category') as Category;
  const condition = formText(formData, 'condition') as Condition;
  const price = Number(formText(formData, 'price'));
  const aiDraft = formText(formData, 'aiDraft') || null;

  if (!(image instanceof File))
    return Response.json({ error: 'Trūksta nuotraukos.' }, { status: 400 });
  if (!MIME_EXTENSIONS[image.type] || image.size > 10 * 1024 * 1024) {
    return Response.json(
      { error: 'Netinkamas nuotraukos failas.' },
      { status: 400 },
    );
  }
  if (
    !title ||
    title.length > 70 ||
    !description ||
    description.length > 1000 ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return Response.json(
      { error: 'Patikrinkite įvestus duomenis.' },
      { status: 400 },
    );
  }
  if (!CATEGORIES.includes(category) || !CONDITIONS.includes(condition)) {
    return Response.json(
      { error: 'Netinkama kategorija arba būklė.' },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const key = `listings/${id}.${MIME_EXTENSIONS[image.type]}`;
  let uploadedImageUrl: string | null = null;

  try {
    const imageBlob = await put(key, image, {
      access: 'public',
      addRandomSuffix: false,
      contentType: image.type,
      cacheControlMaxAge: 31_536_000,
    });
    uploadedImageUrl = imageBlob.url;

    const listing: Listing = {
      id,
      imageUrl: imageBlob.url,
      title,
      description,
      category,
      condition,
      price: Math.round(price * 100) / 100,
      createdAt: new Date().toISOString(),
    };

    const editToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await insertListing(
      { ...listing, aiDraft },
      await hashEditToken(editToken),
    );
    return Response.json({ ...listing, editToken }, { status: 201 });
  } catch (error) {
    if (uploadedImageUrl) await del(uploadedImageUrl).catch(() => undefined);
    console.error('Publish route failed', error);
    return Response.json(
      { error: 'Nepavyko paskelbti skelbimo.' },
      { status: 500 },
    );
  }
}
