import { env } from 'cloudflare:workers';
import { CATEGORIES, CONDITIONS, type ListingDraft } from '@/lib/listings';

export const runtime = 'edge';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SYSTEM_PROMPT = `Esi profesionalus Lietuvos naudotų daiktų skelbimų redaktorius ir vaizdų analizės specialistas.
Iš vienos nuotraukos atpažink PAGRINDINĘ parduodamą prekę ir parenk skelbimo juodraštį.

Atpažinimo taisyklės:
- Vertink pačią nuotrauką, o ne failo pavadinimą. Nekreipk dėmesio į foną, stalą, grindis, pakuotę ar žmogų, jeigu tai nėra parduodama prekė.
- Nurodyk konkretų daikto tipą. Nevartok bendrinių pakaitalų „daiktas“, „prekė“ ar „gaminys“, jeigu objektą galima atpažinti konkrečiau.
- Gamintoją, modelį, medžiagą, matmenis, talpą ar technines savybes minėk tik tada, kai tai aiškiai matoma nuotraukoje. Nieko neišgalvok.
- Iš nuotraukos negalima patvirtinti, kad elektronika veikia, todėl to neteik kaip fakto.

Laukų taisyklės:
- title: konkretus, paieškai tinkamas lietuviškas pavadinimas iki 70 simbolių. Rašyk natūralia vardininko forma, be kainos, būklės ir reklaminio šūkio.
- description: 2–4 pilni, sklandūs sakiniai. Tiksliai įvardyk prekę, aprašyk matomas savybes ir būklę, o neaiškius dalykus suformuluok atsargiai.
- category: pasirink tik vieną pateiktą kategoriją, labiausiai tinkančią pagrindinei prekei.
- condition: spręsk tik pagal matomą kosmetinę būklę. Jei nuotraukos nepakanka, rinkis atsargesnį įvertinimą.
- suggested_price: realistiška naudoto daikto pardavimo kaina eurais kaip teigiamas skaičius. Neįtrauk valiutos ženklo.
- price_reasoning: vienas trumpas sakinys taisyklinga lietuvių kalba, paaiškinantis kainą pagal prekės tipą ir matomą būklę.
- confidence: atpažinimo patikimumas. Jei pagrindinė prekė neaiški, rinkis low, bet vis tiek pateik konkretų geriausią spėjimą.

Kalbos kokybė:
- Visi tekstiniai LAUKŲ DUOMENYS turi būti parašyti tik taisyklinga, natūralia lietuvių kalba.
- Vartok reikiamus lietuviškus diakritinius ženklus, taisyklingus linksnius, skyrybą ir didžiąsias raides.
- Venk pažodinių vertinių, anglicizmų, dirbtinių konstrukcijų ir reklaminių klišių. Matomą dėvėjimą vadink „naudojimo žymėmis“, „nusidėvėjimu“ arba konkrečiais matomais pažeidimais, o ne „naudojimo ženklais“.
- Nevartok angliškų sakinių, maišytos kalbos, žymų, „Markdown“ ar laukų pavadinimų pačiuose tekstuose.
- Prieš pateikdamas JSON, tyliai dar kartą patikrink prekės atpažinimą, rašybą ir gramatiką.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    condition: { type: 'string', enum: CONDITIONS },
    suggested_price: { type: 'number' },
    price_reasoning: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['title', 'description', 'category', 'condition', 'suggested_price', 'price_reasoning', 'confidence'],
};

const proofreadSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    price_reasoning: { type: 'string' },
  },
  required: ['title', 'description', 'price_reasoning'],
};

const PROOFREAD_PROMPT = `Esi itin atidus profesionalus lietuvių kalbos redaktorius.
Taisyk tik pateikto skelbimo pavadinimo, aprašymo ir kainos paaiškinimo kalbą.

- Ištaisyk visas rašybos, gramatikos, linksniavimo, derinimo, skyrybos ir stiliaus klaidas.
- Išlaikyk tą pačią atpažintą prekę ir visas faktines detales. Nepridėk naujų savybių, matmenų, prekės ženklo ar modelio.
- Pavadinimas turi būti natūrali lietuviška daiktavardinė frazė vardininko linksniu, be taško pabaigoje.
- Aprašymas turi būti 2–4 aiškūs, natūralūs ir tarpusavyje derantys sakiniai.
- Kainos paaiškinimas turi būti vienas trumpas, taisyklingas sakinys.
- Pašalink pažodinius vertinius, anglicizmus, nereikalingą reklaminį toną ir nenatūralias konstrukcijas. Dėvėjimą vadink „naudojimo žymėmis“, „nusidėvėjimu“ arba konkrečiais matomais pažeidimais, o ne „naudojimo ženklais“.
- Neteik kaip fakto prekės veikimo, patogumo ar tinkamumo konkrečiai paskirčiai, jeigu to negalima patvirtinti iš nuotraukos.
- Nevartok angliškų sakinių, maišytos kalbos, žymų, kabučių aplink visą tekstą ar „Markdown“.
- Prekių ženklų ir modelių pavadinimų neversk ir netaisyk kaip bendrinių žodžių.

Prieš pateikdamas atsakymą, tyliai perskaityk kiekvieną lauką dar kartą.`;

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
  const combinedText = `${draft.title ?? ''} ${draft.description ?? ''} ${draft.price_reasoning ?? ''}`;
  const hasLithuanian = /[ąčęėįšųūž]/i.test(combinedText);
  const sentenceCount = (draft.description?.match(/[.!?](?:\s|$)/g) ?? []).length;
  const hasGenericTitle = /^(?:tvarkingas|geras|naudotas|parduodamas)?\s*(?:daiktas|prekė|gaminys)$/i.test(
    draft.title?.trim() ?? '',
  );
  const hasFieldLabels = /(?:^|\s)(?:title|description|category|condition|price)\s*:/i.test(combinedText);
  return (
    typeof draft.title === 'string' &&
    draft.title.trim().length >= 3 &&
    draft.title.trim().length <= 70 &&
    !hasGenericTitle &&
    typeof draft.description === 'string' &&
    draft.description.trim().length >= 40 &&
    draft.description.trim().length <= 1000 &&
    sentenceCount >= 2 &&
    CATEGORIES.includes(draft.category as (typeof CATEGORIES)[number]) &&
    CONDITIONS.includes(draft.condition as (typeof CONDITIONS)[number]) &&
    typeof draft.suggested_price === 'number' &&
    Number.isFinite(draft.suggested_price) &&
    draft.suggested_price > 0 &&
    draft.suggested_price <= 1_000_000 &&
    typeof draft.price_reasoning === 'string' &&
    draft.price_reasoning.trim().length >= 10 &&
    draft.price_reasoning.trim().length <= 280 &&
    ['low', 'medium', 'high'].includes(draft.confidence ?? '') &&
    hasLithuanian &&
    !hasFieldLabels
  );
}

function normalizeDraft(draft: ListingDraft): ListingDraft {
  return {
    ...draft,
    title: draft.title.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, ''),
    description: draft.description.trim().replace(/\s+/g, ' '),
    price_reasoning: draft.price_reasoning.trim().replace(/\s+/g, ' '),
    suggested_price: Math.round(draft.suggested_price * 100) / 100,
  };
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
                    ? 'Atidžiai apžiūrėk nuotrauką, atpažink pagrindinę parduodamą prekę ir užpildyk visus skelbimo laukus.'
                    : 'Analizuok iš naujo. Pateik konkretų prekės pavadinimą ir prieš atsakydamas ypač atidžiai ištaisyk visas lietuvių kalbos klaidas.',
              },
              { type: 'input_image', image_url: dataUrl, detail: 'high' },
            ],
          },
        ],
        text: { format: { type: 'json_schema', name: 'listing_draft', strict: true, schema } },
        max_output_tokens: 900,
        temperature: 0.2,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const payload = (await response.json()) as Record<string, unknown>;
    const draft = JSON.parse(extractOutputText(payload)) as unknown;
    if (!isValidDraft(draft)) throw new Error('Invalid listing draft');
    return normalizeDraft(draft);
  } finally {
    clearTimeout(timeout);
  }
}

async function proofreadDraft(draft: ListingDraft): Promise<ListingDraft> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        instructions: PROOFREAD_PROMPT,
        input: JSON.stringify({
          title: draft.title,
          description: draft.description,
          price_reasoning: draft.price_reasoning,
        }),
        text: { format: { type: 'json_schema', name: 'proofread_listing_copy', strict: true, schema: proofreadSchema } },
        max_output_tokens: 600,
        temperature: 0.1,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI proofreading response ${response.status}`);
    const payload = (await response.json()) as Record<string, unknown>;
    const polished = JSON.parse(extractOutputText(payload)) as Partial<ListingDraft>;
    const result = normalizeDraft({
      ...draft,
      title: polished.title ?? '',
      description: polished.description ?? '',
      price_reasoning: polished.price_reasoning ?? '',
    });
    if (!isValidDraft(result)) throw new Error('Invalid proofread listing draft');
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!(file instanceof File)) return Response.json({ error: 'Trūksta nuotraukos.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: 'Failas per didelis.' }, { status: 413 });
    if (!ALLOWED_TYPES.includes(file.type)) return Response.json({ error: 'Nepalaikomas failo formatas.' }, { status: 415 });

    if (!env.OPENAI_API_KEY) {
      return Response.json(
        {
          code: 'AI_NOT_CONFIGURED',
          error: 'DI vaizdų atpažinimas dar neprijungtas. Pridėkite OpenAI API raktą ir bandykite dar kartą.',
        },
        { status: 503 },
      );
    }

    let recognizedDraft: ListingDraft | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        recognizedDraft = await requestDraft(file, attempt);
        break;
      } catch (error) {
        if (attempt === 1) console.error('Image analysis failed', error);
      }
    }

    if (recognizedDraft) {
      try {
        return Response.json(await proofreadDraft(recognizedDraft));
      } catch (error) {
        console.error('Lithuanian proofreading failed', error);
        return Response.json(recognizedDraft);
      }
    }

    return Response.json(
      {
        code: 'AI_ANALYSIS_FAILED',
        error: 'Nepavyko patikimai atpažinti prekės. Pabandykite įkelti aiškesnę nuotrauką.',
      },
      { status: 502 },
    );
  } catch (error) {
    console.error('Analyze route failed', error);
    return Response.json({ error: 'Įvyko klaida. Bandykite dar kartą.' }, { status: 500 });
  }
}
