import { tokenize } from '@/domain/duplicates'
import { ARTICLES, type Article } from './articles'

export type ArticleHit = { article: Article; score: number }

/**
 * Busca por palavras na central de ajuda. Com 9 artigos curtos, palavra-chave resolve bem e
 * não gasta chamada ao modelo; o agent é quem decide se o artigo serve para o caso.
 */
export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const terms = tokenize(query)
  if (terms.size === 0) return []
  return ARTICLES.map((article) => {
    const title = tokenize(article.title)
    const body = tokenize(`${article.body} ${article.appliesTo ?? ''} ${article.category}`)
    let score = 0
    for (const term of terms) {
      if (title.has(term)) score += 2
      else if (body.has(term)) score += 1
    }
    return { article, score: score / terms.size }
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
