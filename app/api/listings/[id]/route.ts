import { getListing } from '@/lib/listing-store';

export const runtime = 'edge';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const listing = await getListing(id);
  if (!listing) return Response.json({ error: 'Skelbimas nerastas.' }, { status: 404 });
  return Response.json(listing);
}
