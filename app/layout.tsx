import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://photo-to-listing.vercel.app'),
  title: 'Paversk nuotrauką į skelbimą',
  description: 'Iš nuotraukos sukurkite taisyklingą lietuvišką skelbimą su pavadinimu, aprašymu, kategorija ir siūloma kaina.',
  openGraph: {
    title: 'Paversk nuotrauką į skelbimą',
    description: 'Įkelkite prekės nuotrauką, peržiūrėkite DI parengtą skelbimą ir paskelbkite jį.',
    locale: 'lt_LT',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Paversk nuotrauką į skelbimą' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Paversk nuotrauką į skelbimą',
    description: 'Iš nuotraukos sukurkite taisyklingą lietuvišką skelbimą per kelias sekundes.',
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
