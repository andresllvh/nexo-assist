import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // o banco (libsql, módulo nativo) e o Mastra rodam só no servidor, fora do bundle
  serverExternalPackages: ['@libsql/client', 'libsql', '@mastra/core'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
