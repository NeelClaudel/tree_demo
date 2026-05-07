import './globals.css';

export const metadata = {
  title: 'Interactive Tree',
  description: 'A canvas tree with seasons, day/night, birds, and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
