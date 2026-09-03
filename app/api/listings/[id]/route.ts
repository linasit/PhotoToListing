import { getListing, updateListing } from '@/lib/listing-store';
import {
  CATEGORIES,
  CONDITIONS,
  type Category,
  type Condition,
} from '@/lib/listings';

type UpdatePayload = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  condition?: unknown;
  price?: unknown;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const listing = await getListing(id);
  if (!listing)
    return Response.json({ error: 'Skelbimas nerastas.' }, { status: 404 });
  return Response.json(listing);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'Nuotraukų saugykla dar neprijungta.' },
      { status: 503 },
    );
  }

  const payload = (await request
    .json()
    .catch(() => null)) as UpdatePayload | null;
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const description =
    typeof payload?.description === 'string' ? payload.description.trim() : '';
  const category = payload?.category as Category;
  const condition = payload?.condition as Condition;
  const price = Number(payload?.price);

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

  const { id } = await context.params;
  try {
    const result = await updateListing(id, {
      title,
      description,
      category,
      condition,
      price: Math.round(price * 100) / 100,
    });

    if (result.status === 'not_found')
      return Response.json({ error: 'Skelbimas nerastas.' }, { status: 404 });
    return Response.json(result.listing);
  } catch (error) {
    console.error('Edit route failed', error);
    return Response.json(
      { error: 'Nepavyko išsaugoti skelbimo pakeitimų.' },
      { status: 500 },
    );
  }
}
