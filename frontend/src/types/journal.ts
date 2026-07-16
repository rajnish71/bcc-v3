/**
 * JournalArticle interface represents a published post, critique, report, or spotlight.
 */
export interface JournalArticle {
  id: string;
  slug: string;
  isSeedData: boolean;
  title: string;
  excerpt: string;
  author: string;
  publishedDate: string; // ISO format YYYY-MM-DD
  coverImage: string; // Local path
  readingTime: string; // e.g. "5 min read"
}
