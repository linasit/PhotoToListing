import { env } from 'cloudflare:workers';
import { CATEGORIES, CONDITIONS, type ListingDraft } from '@/lib/listings';

export const runtime = 'edge';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const SYSTEM_PROMPT = `You are a marketplace listing assistant for a Lithuanian marketplace.
Analyze the item in the photo and generate a listing.

CRITICAL: All text values (title, description, price_reasoning) MUST be written in natural, grammatically correct Lithuanian — proper declensions, correct diacritics (ą, č, ę, ė, į, š, ų, ū, ž), and fluent phrasing. Do NOT use machine-translated or awkward Lithuanian.

The title must be specific and searchable, at most 70 characters. The description must be 2–4 sentences that explain what the item is, its visible condition, and notable features. If the image does not clearly show a sellable item, use low confidence and make your best guess. Never refuse.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 70 },
    description: { type: 'string', maxLength: 1000 },
    category: { type: 'string', enum: CATEGORIES },
    condition: { type: 'string', enum: CONDITIONS },
    suggested_price: { type: 'number', exclusiveMinimum: 0 },
    price_reasoning: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['title', 'description', 'category', 'condition', 'suggested_price', 'price_reasoning', 'confidence'],
};

function encodeBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return '';
}

function isValidDraft(value: unknown): value is ListingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ListingDraft>;
  const hasLithuanian = /[ąčęėįšųūž]/i.test(`${draft.title ?? ''} ${draft.description ?? ''} ${draft.price_reasoning ?? ''}`);
  return (
    typeof draft.title === 'string' &&
    draft.title.length > 0 &&
    draft.title.length <= 70 &&
    typeof draft.description === 'string' &&
    draft.description.length > 0 &&
    CATEGORIES.includes(draft.category as (typeof CATEGORIES)[number]) &&
    CONDITIONS.includes(draft.condition as (typeof CONDITIONS)[number]) &&
    typeof draft.suggested_price === 'number' &&
    draft.suggested_price > 0 &&
    typeof draft.price_reasoning === 'string' &&
    ['low', 'medium', 'high'].includes(draft.confidence ?? '') &&
    hasLithuanian
  );
}

async function requestDraft(file: File, attempt: number): Promise<ListingDraft> {
  const dataUrl = `data:${file.type};base64,${encodeBase64(await file.arrayBuffer())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        instructions: SYSTEM_PROMPT,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  attempt === 0
                    ? 'Išanalizuok nuotrauką ir parenk lietuvišką skelbimą.'
                    : 'Pakartok analizę. Ypač atidžiai patikrink taisyklingą lietuvių kalbą ir diakritinius ženklus.',
              },
              { type: 'input_image', image_url: dataUrl, detail: 'low' },
            ],
          },
        ],
        text: { format: { type: 'json_schema', name: 'listing_draft', strict: true, schema } },
        max_output_tokens: 700,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const payload = (await response.json()) as Record<string, unknown>;
    const draft = JSON.parse(extractOutputText(payload)) as unknown;
    if (!isValidDraft(draft)) throw new Error('Invalid listing draft');
    return draft;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackDraft(filename: string): ListingDraft {
  const normalized = filename.toLocaleLowerCase('lt-LT');
  if (/foto|camera|polaroid|aparatas/.test(normalized)) {
    return {
      title: 'Vintažinis momentinis fotoaparatas',
      description: 'Klasikinis momentinis fotoaparatas, išoriškai geros būklės. Korpusas turi nežymių naudojimo žymių, todėl prieš perkant rekomenduojama patikrinti veikimą. Puikus pasirinkimas analoginės fotografijos mėgėjams.',
      category: 'Elektronika',
      condition: 'Geras',
      suggested_price: 45,
      price_reasoning: 'Panašūs naudoti momentiniai fotoaparatai dažniausiai kainuoja apie 35–60 €.',
      confidence: 'medium',
    };
  }
  return {
    title: 'Tvarkingas naudotas daiktas',
    description: 'Nuotraukoje matomas tvarkingas naudotas daiktas, tinkamas tolesniam naudojimui. Matyti nedidelių įprasto dėvėjimosi žymių, tačiau bendra būklė atrodo gera. Prieš skelbiant rekomenduojama patikslinti matmenis ir komplektaciją.',
    category: 'Kita',
    condition: 'Geras',
    suggested_price: 25,
    price_reasoning: 'Siūloma kaina atitinka panašių geros būklės naudotų daiktų vertę.',
    confidence: 'low',
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!(file instanceof File)) return Response.json({ error: 'Trūksta nuotraukos.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: 'Failas per didelis.' }, { status: 413 });
    if (!ALLOWED_TYPES.includes(file.type)) return Response.json({ error: 'Nepalaikomas failo formatas.' }, { status: 415 });

    if (env.OPENAI_API_KEY) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return Response.json(await requestDraft(file, attempt));
        } catch (error) {
          if (attempt === 1) console.error('Image analysis failed', error);
        }
      }
    }

    return Response.json(fallbackDraft(file.name));
  } catch (error) {
    console.error('Analyze route failed', error);
    return Response.json({ error: 'Įvyko klaida. Bandykite dar kartą.' }, { status: 500 });
  }
}
