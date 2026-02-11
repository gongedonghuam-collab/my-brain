/**
 * 🧠 記憶（メモ）のデータ構造
 * Firestoreの 'memories' コレクションに保存されます。
 */
export interface Memory {
  id: string; // ドキュメントID
  userId: string; // 所有者のUID
  text: string; // メモ本文
  aiSummary?: string; // AIによる短い要約
  tags?: string[]; // タグのリスト（例: ["仕事", "アイデア"]）
  createdAt: any; // 作成日時 (Firestore Timestamp)
  hasImage?: boolean; // 画像が含まれているか
  fileType?: string | null; // ファイルの種類（image/jpegなど）
  embedding?: number[]; // ベクトルデータ（AI検索用）
  sourceUrl?: string; // Web保存の場合の元URL
  score?: number; // 検索時の類似度スコア（表示用）
}

/**
 * 💬 チャット履歴のデータ構造
 * Firestoreの 'chat_logs' コレクションに保存されます。
 */
export interface ChatLog {
  id: string;
  userId: string;
  question: string; // ユーザーの入力
  answer: string; // AIの回答
  createdAt: any;
  mermaidCode?: string | null; // 図解用のMermaidコード（あれば）
  action?: {
    // カレンダー登録などのアクションボタン用データ
    title: string;
    date?: string;
    url: string;
  };
  // UI表示制御用のプロパティ（DBには保存しない一時的な値）
  displayAnswer?: string; // タイピングアニメーション中の表示テキスト
  isAnimating?: boolean; // アニメーション中かどうか
}

/**
 * 👤 ユーザー情報のデータ構造
 * Firestoreの 'users' コレクションに保存されます。
 */
export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  isPro?: boolean; // 課金ユーザーかどうか
  dailyUsage?: number; // 本日のAI使用回数
  lastUsageDate?: string; // 最後に使用した日付 (YYYY-MM-DD)
  stripeId?: string; // Stripeの顧客ID
  role?: string; // ロール（admin, pro, freeなど）
  isLineLinked?: boolean; // LINE連携済みかどうか
  isGoogleLinked?: boolean; // ★追加: Googleカレンダー連携済みフラグ
  defaultLocation?: string; // ★追加: デフォルトの位置情報
}

/**
 * ✅ ToDoタスクのデータ構造
 * Firestoreの 'todos' コレクションに保存されます。
 */
export interface Todo {
  id: string;
  userId: string;
  title: string;
  isCompleted: boolean; // 完了フラグ
  createdAt: any;
  sourceMemoryId?: string; // どのメモから生成されたか（メモ由来の場合）
}

/**
 * 📰 日報のデータ構造
 * Firestoreの 'daily_reports' コレクションに保存されます。
 */
export interface DailyReport {
  id: string;
  userId: string;
  date: string; // 日付文字列 (YYYY-MM-DD)
  content: string; // 日報の本文（AI生成）
  highlights: string[]; // 重要ポイントのリスト
  createdAt: any;
}
