import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Garage Door Lead Finder',
  description: 'Find fresh public leads for garage door repair service',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
