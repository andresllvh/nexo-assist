import type { Metadata } from 'next'
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google'
import './globals.css'

const ui = Schibsted_Grotesk({ variable: '--font-schibsted', subsets: ['latin'] })
const display = Newsreader({ variable: '--font-newsreader', subsets: ['latin'] })
const data = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'Nexo Assist · Service desk de TI',
  description: 'Atendimento de TI da Nexo em uma conversa.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable} ${data.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  )
}
