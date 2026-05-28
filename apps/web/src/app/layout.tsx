import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: 'Owambe — Nigeria\'s Event Platform', template: '%s | Owambe' },
  description: 'Plan, discover, and manage events across Nigeria. Book verified vendors, sell tickets, and run your event end-to-end on Owambe.',
  keywords: ['event planning Nigeria', 'Lagos events', 'event vendors Nigeria', 'owambe events', 'party planning Lagos'],
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'Owambe — Nigeria\'s Event Platform',
    description: 'Plan, discover, and manage events across Nigeria.',
    url: 'https://owambe.com',
    siteName: 'Owambe',
    locale: 'en_NG',
    type: 'website',
    images: [{ url: '/og-icon.png', width: 512, height: 512 }],
  },
  themeColor: '#6C2BD9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-body bg-surface text-dark antialiased`}>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#1C1528', color: '#fff', borderRadius: '9px', fontSize: '14px' },
              success: { iconTheme: { primary: '#6C2BD9', secondary: '#fff' } },
              error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
