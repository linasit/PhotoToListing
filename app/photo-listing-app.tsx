'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import copy from '@/locales/lt.json';
import {
  CATEGORIES,
  CONDITIONS,
  formatPrice,
  relativeTime,
  type Category,
  type Condition,
  type Listing,
  type ListingDraft,
} from '@/lib/listings';

type Stage = 'home' | 'analyzing' | 'edit' | 'detail';
type EditableDraft = Omit<ListingDraft, 'suggested_price'> & { price: string };

const SAMPLE_LISTINGS: Listing[] = [
  {
    id: 'sample-camera',
    imageUrl: '/demo-camera.jpg',
    title: 'Vintažinis momentinis fotoaparatas',
    description: 'Klasikinis momentinis fotoaparatas, išoriškai geros būklės. Korpusas turi nedidelių kosmetinių nusidėvėjimo žymių. Puikus pasirinkimas analoginės fotografijos mėgėjams.',
    category: 'Elektronika',
    condition: 'Geras',
    price: 45,
    createdAt: '2026-09-02T21:45:00.000Z',
  },
  {
    id: 'sample-chair',
    imageUrl: '/demo-chair.jpg',
    title: 'Ąžuolinė valgomojo kėdė',
    description: 'Tvirta natūralaus medžio valgomojo kėdė. Mediena prižiūrėta, konstrukcija stabili, matyti tik nežymių naudojimo žymių. Tiks šviesiam skandinaviško stiliaus interjerui.',
    category: 'Baldai',
    condition: 'Kaip naujas',
    price: 68,
    createdAt: '2026-09-02T21:31:00.000Z',
  },
  {
    id: 'sample-backpack',
    imageUrl: '/demo-backpack.jpg',
    title: 'Raudona žygių kuprinė, 30 l',
    description: 'Patogi 30 litrų žygių kuprinė su reguliuojamais pečių diržais ir keliomis kišenėmis. Audinys švarus, užtrauktukai veikia. Tinka dienos žygiams ir trumpoms kelionėms.',
    category: 'Sportas',
    condition: 'Geras',
    price: 32,
    createdAt: '2026-09-01T16:20:00.000Z',
  },
];

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function normalizeFile(file: File) {
  if (file.type) return file;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const type = extension === 'heic' ? 'image/heic' : extension === 'heif' ? 'image/heif' : '';
  return type ? new File([file], file.name, { type }) : file;
}

async function resizeImage(file: File) {
  if (file.type === 'image/heic' || file.type === 'image/heif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function PhotoListingApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('home');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [form, setForm] = useState<EditableDraft | null>(null);
  const [published, setPublished] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [activeCategory, setActiveCategory] = useState<'Visi' | Category>('Visi');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/listings')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => setPublished((payload as { listings?: Listing[] }).listings ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const allListings = useMemo(
    () => [...published, ...SAMPLE_LISTINGS.filter((sample) => !published.some((item) => item.id === sample.id))],
    [published],
  );

  const visibleListings = useMemo(
    () => (activeCategory === 'Visi' ? allListings : allListings.filter((item) => item.category === activeCategory)),
    [activeCategory, allListings],
  );

  const feedCategories = useMemo(
    () => CATEGORIES.filter((category) => allListings.some((listing) => listing.category === category)),
    [allListings],
  );

  function showMessage(tone: 'success' | 'error', text: string) {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 4200);
  }

  async function analyzePhoto(sourceFile: File) {
    const normalized = normalizeFile(sourceFile);
    const extension = normalized.name.split('.').pop()?.toLowerCase();
    const supported = allowedTypes.includes(normalized.type) || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension ?? '');
    if (!supported) {
      showMessage('error', copy.error_file_type);
      return;
    }
    if (normalized.size > 10 * 1024 * 1024) {
      showMessage('error', copy.error_file_too_large);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(normalized);
    setPreviewUrl(nextPreviewUrl);
    setStage('analyzing');
    setDraft(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const resized = await resizeImage(normalized);
    setFile(resized);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const body = new FormData();
      body.append('image', resized);
      const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal });
      if (!response.ok) throw new Error('analysis failed');
      const result = (await response.json()) as ListingDraft;
      setDraft(result);
      setForm({
        title: result.title,
        description: result.description,
        category: result.category,
        condition: result.condition,
        price: result.suggested_price.toFixed(2),
        price_reasoning: result.price_reasoning,
        confidence: result.confidence,
      });
      setStage('edit');
    } catch {
      setStage('home');
      showMessage('error', copy.error_generic);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function discardDraft() {
    setStage('home');
    setDraft(null);
    setForm(null);
    setFile(null);
    setPreviewUrl('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function publishListing(event?: React.FormEvent) {
    event?.preventDefault();
    if (!form || !file) return;
    if (!form.title.trim() || form.title.length > 70) return showMessage('error', copy.error_title);
    if (!form.description.trim() || form.description.length > 1000) return showMessage('error', copy.error_description);
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) return showMessage('error', copy.error_price);

    setIsPublishing(true);
    try {
      const body = new FormData();
      body.append('image', file);
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      body.append('category', form.category);
      body.append('condition', form.condition);
      body.append('price', form.price);
      body.append('aiDraft', JSON.stringify(draft));
      const response = await fetch('/api/listings', { method: 'POST', body });
      if (!response.ok) throw new Error('publish failed');
      const listing = (await response.json()) as Listing;
      setPublished((current) => [listing, ...current]);
      setStage('home');
      setDraft(null);
      setForm(null);
      setFile(null);
      setPreviewUrl('');
      showMessage('success', copy.published_success);
      window.setTimeout(() => document.getElementById('srautas')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch {
      showMessage('error', copy.error_generic);
    } finally {
      setIsPublishing(false);
    }
  }

  function openDetail(listing: Listing) {
    setSelectedListing(listing);
    setStage('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showFeed() {
    setStage('home');
    setSelectedListing(null);
    window.setTimeout(() => document.getElementById('srautas')?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  return (
    <main className="min-h-screen overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <button onClick={() => { setStage('home'); setSelectedListing(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex min-h-11 items-center gap-2.5 text-left font-bold tracking-[-0.02em]">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_18px_rgba(214,63,30,0.22)]">
            <Camera className="size-[18px]" strokeWidth={2.4} />
          </span>
          <span>{copy.app_name}</span>
        </button>
        {stage === 'home' ? (
          <button onClick={showFeed} className="hidden min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors hover:bg-secondary sm:flex">
            {copy.feed_link} <ArrowRight className="size-4" />
          </button>
        ) : (
          <button onClick={showFeed} className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors hover:bg-secondary sm:px-4">
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{copy.back_to_feed}</span><span className="sm:hidden">{copy.feed_link}</span>
          </button>
        )}
      </header>

      {stage === 'home' && (
        <>
          <section id="pradzia" className="mx-auto grid w-full max-w-[1180px] gap-8 px-5 pb-14 pt-6 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-16 lg:px-10 lg:pb-20 lg:pt-12">
            <div>
              <Badge className="mb-5 h-7 gap-1.5 bg-[#e5efdc] px-3 text-[#285d36] hover:bg-[#e5efdc]">
                <Zap className="size-3.5 fill-current" /> {copy.hero_eyebrow}
              </Badge>
              <h1 className="max-w-xl text-[clamp(2.65rem,8vw,5rem)] font-[760] leading-[0.94] tracking-[-0.065em] text-foreground">
                {copy.hero_title} <span className="text-primary">{copy.hero_title_accent}</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">{copy.hero_description}</p>
              <div className="mt-7 flex items-center gap-3 text-sm font-medium text-muted-foreground">
                <Sparkles className="size-4 text-primary" /> {copy.ai_note}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-5 -top-5 size-28 rounded-full bg-[#f3cb55]/35 blur-2xl" />
              <div className="relative rounded-[28px] border border-[#d8d3c7] bg-card p-3 shadow-[0_22px_70px_rgba(55,49,36,0.12)] sm:p-5">
                <div
                  onDragEnter={(event) => { event.preventDefault(); setIsDragActive(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={(event) => { event.preventDefault(); setIsDragActive(false); const dropped = event.dataTransfer.files[0]; if (dropped) void analyzePhoto(dropped); }}
                  className={`group flex min-h-[330px] flex-col items-center justify-center rounded-[20px] border-[1.5px] border-dashed px-6 text-center transition sm:min-h-[410px] ${isDragActive ? 'border-primary bg-[#fff1e9]' : 'border-[#b7b09f] bg-[#f8f5ed]'}`}
                >
                  <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" capture="environment" onChange={(event) => { const chosen = event.target.files?.[0]; if (chosen) void analyzePhoto(chosen); event.target.value = ''; }} />
                  <span className="grid size-16 place-items-center rounded-2xl bg-foreground text-background shadow-lg transition-transform group-hover:-translate-y-1">
                    {isDragActive ? <Upload className="size-7" /> : <ImagePlus className="size-7" />}
                  </span>
                  <span className="mt-5 max-w-sm text-xl font-bold tracking-[-0.025em] sm:text-2xl">{isDragActive ? copy.drop_photo : copy.upload_cta}</span>
                  <span className="mt-2 text-sm leading-6 text-muted-foreground">{copy.upload_formats}</span>
                  <Button size="lg" className="mt-6 min-h-12 rounded-full px-6 text-[15px]" type="button" onClick={(event) => { event.preventDefault(); inputRef.current?.click(); }}>
                    <Camera className="size-[18px]" /> {copy.choose_photo}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section id="srautas" className="border-t border-[#ddd8cc] bg-[#ebe7dc]">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">{copy.feed_eyebrow}</p>
                  <h2 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">{copy.feed_title}</h2>
                </div>
                <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span className="size-2 rounded-full bg-[#4c8b59]" />{copy.feed_realtime}</span>
              </div>

              <div className="-mx-5 mb-7 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
                <Button type="button" variant={activeCategory === 'Visi' ? 'default' : 'outline'} className="min-h-11 shrink-0 rounded-full px-4" onClick={() => setActiveCategory('Visi')}>{copy.filter_all}</Button>
                {feedCategories.map((category) => (
                  <Button key={category} type="button" variant={activeCategory === category ? 'default' : 'outline'} className="min-h-11 shrink-0 rounded-full bg-card px-4" onClick={() => setActiveCategory(category)}>{category}</Button>
                ))}
              </div>

              {visibleListings.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#b7b09f] px-6 py-16 text-center text-muted-foreground">{copy.feed_empty}</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleListings.map((listing) => (
                    <button key={listing.id} type="button" onClick={() => openDetail(listing)} className="group overflow-hidden rounded-[22px] border border-[#d5d0c4] bg-card text-left shadow-[0_4px_18px_rgba(55,49,36,0.05)] transition hover:-translate-y-1 hover:shadow-[0_14px_35px_rgba(55,49,36,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
                      <div className="aspect-[4/3] overflow-hidden bg-secondary">
                        <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                      </div>
                      <div className="p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Badge variant="secondary" className="bg-[#e5efdc] text-[#285d36]">{listing.category}</Badge>
                          <span className="text-xs text-muted-foreground">{relativeTime(listing.createdAt, currentTime ?? undefined)}</span>
                        </div>
                        <h3 className="line-clamp-2 min-h-[3rem] text-lg font-bold leading-6 tracking-[-0.025em]">{listing.title}</h3>
                        <p className="mt-3 text-2xl font-[760] tracking-[-0.04em]">{formatPrice(listing.price)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {stage === 'analyzing' && (
        <section className="mx-auto grid w-full max-w-[980px] gap-8 px-5 pb-20 pt-6 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-10 lg:pt-14">
          <div className="relative aspect-square overflow-hidden rounded-[28px] bg-secondary shadow-[0_22px_70px_rgba(55,49,36,0.14)]">
            {previewUrl && <img src={previewUrl} alt={copy.analyzing_photo_alt} className="h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-foreground/15 backdrop-blur-[2px]" />
            <div className="absolute inset-0 grid place-items-center"><span className="grid size-16 place-items-center rounded-full bg-card/95 shadow-xl"><LoaderCircle className="size-7 animate-spin text-primary" /></span></div>
          </div>
          <div>
            <Badge className="mb-5 h-7 gap-1.5 bg-[#e5efdc] px-3 text-[#285d36] hover:bg-[#e5efdc]"><Sparkles className="size-3.5" /> DI analizė</Badge>
            <h1 className="text-4xl font-bold tracking-[-0.05em] sm:text-5xl">{copy.analyzing}</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">{copy.analyzing_hint}</p>
            <div className="mt-8 space-y-3" aria-hidden="true">
              <div className="h-3 w-3/4 animate-pulse rounded-full bg-[#d8d3c7]" />
              <div className="h-3 w-full animate-pulse rounded-full bg-[#d8d3c7] [animation-delay:120ms]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#d8d3c7] [animation-delay:240ms]" />
            </div>
          </div>
        </section>
      )}

      {stage === 'edit' && form && (
        <section className="mx-auto w-full max-w-[1120px] px-5 pb-32 pt-5 sm:px-8 lg:px-10 lg:pb-20 lg:pt-10">
          <div className="mb-8 max-w-3xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">{copy.edit_eyebrow}</p>
            <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-5xl">{copy.edit_title}</h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">{copy.edit_hint}</p>
          </div>

          {form.confidence === 'low' && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#e5b94d] bg-[#fff5cf] p-4 text-sm font-medium text-[#684e0d]" role="status">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" /> {copy.low_confidence_warning}
            </div>
          )}

          <form onSubmit={publishListing} className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-10">
            <div className="lg:sticky lg:top-6">
              <Label className="mb-3">{copy.photo_label}</Label>
              <div className="aspect-square overflow-hidden rounded-[26px] border border-[#d5d0c4] bg-secondary shadow-[0_14px_40px_rgba(55,49,36,0.1)]">
                <img src={previewUrl} alt={form.title} className="h-full w-full object-cover" />
              </div>
              <Button type="button" variant="outline" className="mt-4 min-h-11 w-full rounded-full bg-card" onClick={() => file && void analyzePhoto(file)}>
                <RefreshCw className="size-4" /> {copy.regenerate}
              </Button>
            </div>

            <div className="rounded-[26px] border border-[#d5d0c4] bg-card p-5 shadow-[0_14px_40px_rgba(55,49,36,0.07)] sm:p-7">
              <div className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3"><Label htmlFor="title">{copy.title_label}</Label><span className="text-xs text-muted-foreground">{form.title.length}/70 {copy.characters}</span></div>
                  <Input id="title" required maxLength={70} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-12 rounded-xl px-4 text-base md:text-base" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3"><Label htmlFor="description">{copy.description_label}</Label><span className="text-xs text-muted-foreground">{form.description.length}/1000 {copy.characters}</span></div>
                  <Textarea id="description" required maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-36 rounded-xl px-4 py-3 text-base leading-6 md:text-base" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div><Label htmlFor="category" className="mb-2">{copy.category_label}</Label><NativeSelect className="w-full [&_[data-slot=native-select]]:h-12 [&_[data-slot=native-select]]:rounded-xl [&_[data-slot=native-select]]:px-4 [&_[data-slot=native-select]]:text-base" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })} id="category">{CATEGORIES.map((category) => <NativeSelectOption key={category} value={category}>{category}</NativeSelectOption>)}</NativeSelect></div>
                  <div><Label htmlFor="condition" className="mb-2">{copy.condition_label}</Label><NativeSelect className="w-full [&_[data-slot=native-select]]:h-12 [&_[data-slot=native-select]]:rounded-xl [&_[data-slot=native-select]]:px-4 [&_[data-slot=native-select]]:text-base" value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value as Condition })} id="condition">{CONDITIONS.map((condition) => <NativeSelectOption key={condition} value={condition}>{condition}</NativeSelectOption>)}</NativeSelect></div>
                </div>
                <div>
                  <Label htmlFor="price" className="mb-2">{copy.price_label}</Label>
                  <div className="relative"><Input id="price" required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="h-14 rounded-xl px-4 pr-12 text-xl font-bold md:text-xl" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">€</span></div>
                  <div className="mt-3 rounded-xl bg-[#f1eee6] p-3 text-sm leading-6 text-muted-foreground"><span className="font-semibold text-foreground">{copy.price_reasoning_label}</span> {form.price_reasoning}</div>
                </div>
              </div>

              <div className="mt-7 hidden gap-3 border-t border-border pt-6 lg:flex">
                <Button type="button" variant="outline" className="min-h-12 rounded-full px-5" onClick={discardDraft}><Trash2 className="size-4" /> {copy.discard}</Button>
                <Button type="submit" className="min-h-12 flex-1 rounded-full px-6 text-base" disabled={isPublishing}>{isPublishing ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{isPublishing ? copy.publishing : copy.publish}</Button>
              </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-[#d5d0c4] bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(55,49,36,0.12)] backdrop-blur lg:hidden">
              <Button type="button" variant="outline" className="min-h-12 flex-1 rounded-full" onClick={discardDraft}>{copy.discard}</Button>
              <Button type="submit" className="min-h-12 flex-[1.4] rounded-full text-base" disabled={isPublishing}>{isPublishing ? <LoaderCircle className="size-4 animate-spin" /> : null}{isPublishing ? copy.publishing : copy.publish}</Button>
            </div>
          </form>
        </section>
      )}

      {stage === 'detail' && selectedListing && (
        <section className="mx-auto w-full max-w-[1060px] px-5 pb-20 pt-5 sm:px-8 lg:px-10 lg:pt-10">
          <button type="button" onClick={showFeed} className="mb-6 flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> {copy.back_to_feed}</button>
          <article className="grid overflow-hidden rounded-[28px] border border-[#d5d0c4] bg-card shadow-[0_20px_60px_rgba(55,49,36,0.1)] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="min-h-[340px] bg-secondary lg:min-h-[620px]"><img src={selectedListing.imageUrl} alt={selectedListing.title} className="h-full w-full object-cover" /></div>
            <div className="flex flex-col p-6 sm:p-9 lg:p-10">
              <div className="flex flex-wrap items-center gap-2"><Badge className="bg-[#e5efdc] text-[#285d36] hover:bg-[#e5efdc]">{selectedListing.category}</Badge><Badge variant="outline">{selectedListing.condition}</Badge></div>
              <h1 className="mt-5 text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-4xl">{selectedListing.title}</h1>
              <p className="mt-5 text-4xl font-[760] tracking-[-0.05em] text-primary">{formatPrice(selectedListing.price)}</p>
              <div className="my-7 h-px bg-border" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.detail_description}</h2>
              <p className="mt-3 text-base leading-7 text-foreground/85">{selectedListing.description}</p>
              <div className="mt-auto pt-8 text-sm text-muted-foreground">{copy.listed} · {relativeTime(selectedListing.createdAt, currentTime ?? undefined)}</div>
            </div>
          </article>
        </section>
      )}

      {message && (
        <div className={`fixed right-4 top-4 z-50 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border p-4 pr-3 shadow-2xl sm:right-6 sm:top-6 ${message.tone === 'success' ? 'border-[#93b99a] bg-[#ecf7e8] text-[#285d36]' : 'border-[#e3a99c] bg-[#fff0eb] text-[#8f2d19]'}`} role="status" aria-live="polite">
          {message.tone === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}
          <span className="text-sm font-semibold">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5" aria-label="Uždaryti"><X className="size-4" /></button>
        </div>
      )}
    </main>
  );
}
