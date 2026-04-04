export interface LoginStatus {
  loggedIn: boolean;
  username?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  author: string;
  date: string;
  replies: number;
  views: number;
  subforum: string;
  tags: string[];
  snippet?: string;
}

export interface ThreadPost {
  author: string;
  date: string;
  content: string;
  postNumber: number;
  reputation?: number;
}

export interface ThreadData {
  title: string;
  tags: string[];
  posts: ThreadPost[];
  currentPage: number;
  totalPages: number;
  url: string;
}

export interface CodeBlock {
  code: string;
  language: string;
  context?: string;
  postId?: string;
}
