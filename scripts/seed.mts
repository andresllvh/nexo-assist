// Recria o banco com os dados de exemplo (funcionários, chamados em situações variadas).
import { createDb, migrate } from '../src/server/db'
import { seed } from '../src/server/seed'

process.loadEnvFile()
const db = createDb()
await migrate(db)
await seed(db)
console.log('Banco recriado com os dados de exemplo.')
