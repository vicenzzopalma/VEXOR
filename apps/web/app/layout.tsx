
import type { Metadata } from 'next';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@xyflow/react/dist/style.css';
import './globals.css';
import { Shell } from '@/components/shell';
export const metadata: Metadata = {
  title: 'EIMAX Studio — seus processos, em movimento',
  description: 'Crie, personalize e simule processos comerciais em um editor visual simples.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
