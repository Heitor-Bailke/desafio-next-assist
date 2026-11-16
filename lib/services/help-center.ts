import type Database from "better-sqlite3";
import { z } from "zod";

const querySchema = z.string().trim().min(2).max(200);

export type HelpArticle = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
};

type HelpArticleRow = {
  id: string;
  title: string;
  content: string;
  keywords: string;
};

export class SqliteHelpCenterService {
  public constructor(private readonly database: Database.Database) {}

  public search(query: string): HelpArticle[] {
    const parsedQuery = querySchema.parse(query).toLocaleLowerCase("pt-BR");
    const terms = parsedQuery.split(/\s+/u).filter((term) => term.length >= 2);
    const rows = this.database.prepare("SELECT id, title, content, keywords FROM help_articles").all() as HelpArticleRow[];

    return rows
      .map((row) => ({
        article: {
          id: row.id,
          title: row.title,
          content: row.content,
          keywords: row.keywords.split(",").map((keyword) => keyword.trim()),
        },
        score: terms.reduce((score, term) => {
          const haystack = `${row.title} ${row.content} ${row.keywords}`.toLocaleLowerCase("pt-BR");
          return score + (haystack.includes(term) ? 1 : 0);
        }, 0),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.article);
  }
}