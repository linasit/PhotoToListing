export const CATEGORIES = [
  'Elektronika',
  'Drabužiai',
  'Namai ir sodas',
  'Žaislai ir žaidimai',
  'Sportas',
  'Knygos ir medija',
  'Baldai',
  'Grožis',
  'Kolekcionavimas',
  'Kita',
] as const;

export const CONDITIONS = ['Naujas', 'Kaip naujas', 'Geras', 'Patenkinamas', 'Dalims'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type Confidence = 'low' | 'medium' | 'high';

export type ListingDraft = {
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  suggested_price: number;
  price_reasoning: string;
  confidence: Confidence;
};

export type Listing = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  category: Category;
  condition: Condition;
  price: number;
  createdAt: string;
};

export function formatPrice(price: number) {
  return new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR' }).format(price);
}

export function relativeTime(dateString: string, now?: number) {
  if (now === undefined) return dateString.slice(0, 10);
  const elapsed = now - new Date(dateString).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return 'ką tik';
  if (minutes < 60) return `prieš ${minutes} min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `prieš ${hours} val.`;
  if (hours < 48) return 'vakar';
  return new Intl.DateTimeFormat('lt-LT', { dateStyle: 'medium' }).format(new Date(dateString));
}
