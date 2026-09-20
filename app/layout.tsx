import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'One Minute Utopia — AI Civic Reporting',
  description:
    'Report Baltimore public issues from a photo with AI-assisted classification, city routing, and community incident mapping.',
  applicationName: 'One Minute Utopia',
  keywords: ['Baltimore', '311', 'civic reporting', 'public safety', 'AI image analysis'],
  openGraph: {
    title: 'One Minute Utopia — AI Civic Reporting',
    description:
      'Turn a photo into a structured Baltimore civic report and help connect nearby reports into one community signal.',
    siteName: 'One Minute Utopia',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'One Minute Utopia — AI Civic Reporting',
    description:
      'Turn a photo into a structured Baltimore civic report and community incident signal.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
