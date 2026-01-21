// 脳みそに保存するデータの型
export interface Memory {
  id: string;
  userId: string;
  text: string;
  aiSummary?: string;
  tags?: string[];
  createdAt: any;
  hasImage?: boolean;
  fileType?: string | null; // ★修正: null を許容するように変更
  embedding?: number[];
  sourceUrl?: string;
  score?: number;
}

export interface ChatLog {
  id: string;
  userId: string;
  question: string;
  answer: string;
  createdAt: any;
  mermaidCode?: string | null;
  action?: {
    title: string;
    date?: string;
    url: string;
  };
  // ★追加: アニメーション表示用
  displayAnswer?: string;
  isAnimating?: boolean;
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  isPro?: boolean;
  dailyUsage?: number;
  lastUsageDate?: string;
  stripeId?: string;
  role?: string;
  isLineLinked?: boolean;
}

export interface Todo {
  id: string;
  userId: string;
  title: string;
  isCompleted: boolean;
  createdAt: any;
  sourceMemoryId?: string;
}

export interface DailyReport {
  id: string;
  userId: string;
  date: string;
  content: string;
  highlights: string[];
  createdAt: any;
}
