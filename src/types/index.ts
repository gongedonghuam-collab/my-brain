// 脳みそに保存するデータの型
export interface Memory {
  id: string;
  userId: string;
  text: string; // メモの内容
  aiSummary?: string; // AIによる要約
  tags?: string[]; // AIがつけたタグ
  createdAt: any;
}
