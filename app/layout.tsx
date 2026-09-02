import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nuotrauka į skelbimą',
  description: 'Paverskite daikto nuotrauką paruoštu lietuvišku skelbimu per kelias sekundes.',
  openGraph: {
    title: 'Nuotrauka į skelbimą',
    description: 'Nufotografuokite daiktą, paredaguokite DI parengtą skelbimą ir iškart jį paskelbkite.',
    locale: 'lt_LT',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Nuotrauka į skelbimą' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nuotrauka į skelbimą',
    description: 'Lietuviškas skelbimas iš vienos nuotraukos per kelias sekundes.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f3f0e8' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="lt">
      <body className={`${geist.variable} antialiased`}>{children}</body>
    </html>
  );
}
