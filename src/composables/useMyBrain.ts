import { ref, computed } from "vue";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  limit,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  orderBy,
  serverTimestamp,
  where,
  onSnapshot,
  increment,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ★ここにStripeの商品ID (price_xxxx) を入れてください
const STRIPE_PRICE_ID = "price_XXXXXXXXXXXXXXXXXXXXXXXX";

// ★ここに無条件でPRO扱いにするメールアドレスを入れてください
const ADMIN_EMAILS = [
  "gongedonghuam@gmail.com", // あなたのアドレス
];

export interface Memory {
  id: string;
  userId: string;
  text: string;
  aiSummary?: string;
  tags?: string[];
  createdAt: any;
  hasImage?: boolean;
  fileType?: string;
  embedding?: number[];
  sourceUrl?: string;
}

export interface ChatLog {
  id: string;
  userId: string;
  question: string;
  answer: string;
  createdAt: any;
  mermaidCode?: string;
  action?: {
    title: string;
    date?: string;
    url: string;
  };
}

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string | null;
  // ▼ 課金・制限用データ
  isPro?: boolean;
  dailyUsage?: number;
  lastUsageDate?: string;
  stripeId?: string;
  role?: string;
}

const currentUser = ref<User | null>(null);
const memories = ref<Memory[]>([]);
const chatLogs = ref<ChatLog[]>([]);
const loading = ref(false);
const isAiThinking = ref(false);
const activeTag = ref<string | null>(null);

// ファイルをBase64に変換
const fileToGenerativePart = async (file: File) => {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve({ inlineData: { data: base64String, mimeType: file.type } });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    },
  );
};

// コサイン類似度 (関連度計算)
const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export function useMyBrain() {
  const getEmbeddingModel = (apiKey: string) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "text-embedding-004" });
  };

  const getSmartModelName = async (apiKey: string): Promise<string> => {
    try {
      // Proユーザーなら高性能モデルを使うなどの分岐も可能
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const listResponse = await fetch(listUrl);
      if (!listResponse.ok) return "gemini-1.5-flash";
      const listData = await listResponse.json();
      const generationModels = (listData.models || []).filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      );
      // Flashモデルを優先
      const flash = generationModels.find((m: any) =>
        m.name.includes("gemini-1.5-flash"),
      );
      const targetModelObj = flash || generationModels[0];
      return targetModelObj?.name.replace("models/", "") || "gemini-1.5-flash";
    } catch (e) {
      return "gemini-1.5-flash";
    }
  };

  // ----------------------------------------------------
  // ▼ 1. 課金・制限ロジック
  // ----------------------------------------------------
  const checkAndIncrementUsage = async (): Promise<boolean> => {
    if (!currentUser.value) return false;

    // Proユーザーは無制限
    if (currentUser.value.isPro) return true;

    const todayStr = new Date().toISOString().split("T")[0];
    const userRef = doc(db, "users", currentUser.value.uid);

    // 確実な判定のため最新データを取得
    const snap = await getDoc(userRef);
    const data = snap.data();

    let currentCount = 0;

    // 日付が変わっていたらリセット
    if (data?.lastUsageDate !== todayStr) {
      currentCount = 0;
      await updateDoc(userRef, {
        dailyUsage: 0,
        lastUsageDate: todayStr,
      });
    } else {
      currentCount = data?.dailyUsage || 0;
    }

    // 制限チェック (5回)
    if (currentCount >= 5) {
      alert(
        "本日の無料枠（5回）を使い切りました。\nProプランで無制限に解放しましょう！🚀",
      );
      return false;
    }

    // カウントアップ
    await updateDoc(userRef, {
      dailyUsage: increment(1),
      lastUsageDate: todayStr,
    });

    return true;
  };

  // Stripe Checkoutへ遷移
  const startSubscription = async () => {
    if (!currentUser.value) return;

    // Extensionが監視するコレクションへ書き込み
    const sessionsRef = collection(
      db,
      "users",
      currentUser.value.uid,
      "checkout_sessions",
    );
    const docRef = await addDoc(sessionsRef, {
      price: STRIPE_PRICE_ID,
      success_url: window.location.origin + "/app",
      cancel_url: window.location.origin + "/app",
    });

    // URL発行を待機
    onSnapshot(docRef, (snap) => {
      const { url } = snap.data() || {};
      if (url) {
        window.location.assign(url);
      }
    });
  };

  // ----------------------------------------------------
  // ▼ 2. 認証・初期化 (修正版)
  // ----------------------------------------------------
  const initAuth = () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // ★修正: まずユーザーIDを確定させて、データ取得ができる状態にする
        currentUser.value = {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || undefined,
          photoURL: user.photoURL || undefined,
          isPro: false, // 仮のデフォルト値
          dailyUsage: 0,
        };

        // 並行して詳細データを監視
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          const data = docSnap.data();
          if (data && currentUser.value) {
            const isAdmin = ADMIN_EMAILS.includes(user.email || "");
            const isSubscribed =
              !!data.stripeId || data.role === "pro" || isAdmin;

            currentUser.value = {
              ...currentUser.value, // uid等を維持
              displayName: data.displayName || currentUser.value.displayName,
              isPro: isSubscribed,
              dailyUsage: data.dailyUsage || 0,
              lastUsageDate: data.lastUsageDate,
              stripeId: data.stripeId,
              role: data.role,
            };
          }
        });

        // ユーザーIDがセットされた状態でデータ取得を実行
        await Promise.all([fetchMemories(), fetchChatLogs()]);
      } else {
        currentUser.value = null;
        memories.value = [];
        chatLogs.value = [];
      }
    });
  };

  const logout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  // ----------------------------------------------------
  // ▼ 3. データ取得
  // ----------------------------------------------------
  const fetchMemories = async () => {
    if (!currentUser.value) return;
    loading.value = true;
    try {
      // 全件取得 (新しい順)
      let q = query(
        collection(db, "memories"),
        where("userId", "==", currentUser.value.uid),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      memories.value = snap.docs.map(
        (d) =>
          ({
            id: d.id,
            ...d.data(),
          }) as Memory,
      );
    } catch (e) {
      console.error("Fetch memories error:", e);
    } finally {
      loading.value = false;
    }
  };

  const fetchChatLogs = async () => {
    if (!currentUser.value) return;
    try {
      const q = query(
        collection(db, "chat_logs"),
        where("userId", "==", currentUser.value.uid),
        orderBy("createdAt", "desc"),
        limit(50),
      );
      const snap = await getDocs(q);
      chatLogs.value = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as ChatLog)
        .reverse();
    } catch (e) {
      console.error("Fetch chat logs error:", e);
    }
  };

  const selectTag = async (tag: string | null) => {
    activeTag.value = tag;
  };

  const filteredMemories = computed(() => {
    if (!activeTag.value) return memories.value;
    return memories.value.filter((m) => m.tags?.includes(activeTag.value!));
  });

  // ----------------------------------------------------
  // ▼ 4. メモ追加 (AI解析・音声対応・リコメンド)
  // ----------------------------------------------------
  const addMemory = async (text: string, file?: File | null) => {
    // 制限チェック
    const canUse = await checkAndIncrementUsage();
    if (!canUse) return null;

    if (!currentUser.value) return null;
    isAiThinking.value = true;

    try {
      const isImage = file?.type.startsWith("image/");
      const isPdf = file?.type === "application/pdf";
      const isAudio = file?.type.startsWith("audio/");

      const fileTypeLabel = isImage
        ? "画像"
        : isPdf
          ? "PDF"
          : isAudio
            ? "音声"
            : "ファイル";
      const initialText = file ? `(${fileTypeLabel}解析中...) ${text}` : text;

      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value.uid,
        text: initialText,
        createdAt: serverTimestamp(),
        tags: [],
        aiSummary: "AI処理中...",
        hasImage: !!file,
        fileType: file?.type || null,
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (apiKey) {
        const targetModelName = await getSmartModelName(apiKey);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: targetModelName,
          generationConfig: { responseMimeType: "application/json" },
        });

        let promptParts: any[] = [];

        if (file) {
          const filePart = await fileToGenerativePart(file);
          promptParts.push(filePart);

          // ★音声(議事録)対応
          if (isAudio) {
            promptParts.push({
              text: `
                これは会議や独り言の音声データです。以下の指示に従って処理してください。
                1. 内容を詳細に書き起こし・要約してください。
                2. 決定事項やネクストアクション（タスク）があれば抽出してください。
                3. ユーザーのメモ: ${text}
                
                出力形式: JSON {"summary": "20字以内のタイトル", "tags": ["議事録", "音声メモ"], "fullText": "## 要約\n...\n\n## 書き起こし\n...\n\n## タスク\n- [ ] ..."}
              `,
            });
          } else {
            // 画像・PDF用
            promptParts.push({
              text: `
                画像/資料を分析して記憶データを作成してください。
                ユーザーメモ: ${text}
                出力形式: JSON {"summary": "20字要約", "tags": ["タグ"], "fullText": "全テキスト"}
              `,
            });
          }
        } else {
          promptParts.push({
            text: `
            以下のテキストを分析して記憶データを作成してください。
            内容: ${text}
            出力形式: JSON {"summary": "20字要約", "tags": ["タグ"], "fullText": "${text}"}
          `,
          });
        }

        const result = await model.generateContent(promptParts);
        const aiData = JSON.parse(result.response.text());
        const finalContent = file
          ? `【${fileTypeLabel}】${text}\n\n${aiData.fullText}`
          : text;

        const embedModel = getEmbeddingModel(apiKey);
        const embedResult = await embedModel.embedContent(finalContent);
        const embedding = embedResult.embedding.values;

        await updateDoc(docRef, {
          text: finalContent,
          aiSummary: aiData.summary,
          tags: aiData.tags,
          embedding: embedding,
        });

        const newMem: Memory = {
          id: docRef.id,
          userId: currentUser.value.uid,
          text: finalContent,
          aiSummary: aiData.summary,
          tags: aiData.tags,
          createdAt: new Date(),
          hasImage: !!file,
          fileType: file?.type,
          embedding: embedding,
        };
        memories.value.unshift(newMem);

        // ★「芋づる式」リコメンドロジック
        // 類似度が高い(0.65以上)過去のメモを探す
        const relatedMemories = memories.value
          .filter((m) => m.id !== docRef.id && m.embedding)
          .map((m) => ({
            ...m,
            score: m.embedding ? cosineSimilarity(embedding, m.embedding) : 0,
          }))
          .filter((m) => m.score > 0.65)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3); // Top 3

        return relatedMemories; // 関連メモを返す
      }
    } catch (e) {
      console.error("Add memory error:", e);
      alert("保存エラー");
      return null;
    } finally {
      isAiThinking.value = false;
    }
    return null;
  };

  const addUrlMemory = async (url: string) => {
    const canUse = await checkAndIncrementUsage();
    if (!canUse) return;

    if (!currentUser.value) return;
    isAiThinking.value = true;

    try {
      const functions = getFunctions();
      const scrapeFunc = httpsCallable(functions, "scrapeUrl");
      const result: any = await scrapeFunc({ url });

      if (result.data.success) {
        const { title, content } = result.data;
        const fullText = `【WEB記事】${title}\nURL: ${url}\n\n${content}`;
        // URL保存もEmbedding対象にするため addMemory を経由して保存
        await addMemory(fullText);
      }
    } catch (e: any) {
      console.error("URL Add Error:", e);
      alert("記事の読み込みに失敗しました: " + e.message);
    } finally {
      isAiThinking.value = false;
    }
  };

  const updateMemory = async (id: string, newText: string) => {
    if (!currentUser.value || !newText.trim()) return;
    try {
      await updateDoc(doc(db, "memories", id), { text: newText });
      const target = memories.value.find((m) => m.id === id);
      if (target) target.text = newText;
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMemory = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    await deleteDoc(doc(db, "memories", id));
    memories.value = memories.value.filter((m) => m.id !== id);
  };

  const deleteChatLog = async (id: string) => {
    await deleteDoc(doc(db, "chat_logs", id));
    chatLogs.value = chatLogs.value.filter((l) => l.id !== id);
  };

  // ----------------------------------------------------
  // ▼ 5. チャット機能
  // ----------------------------------------------------
  const askBrain = async (question: string): Promise<string> => {
    const canUse = await checkAndIncrementUsage();
    if (!canUse) return "";

    if (!question.trim() || !currentUser.value) return "";
    isAiThinking.value = true;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      const embedModel = getEmbeddingModel(apiKey);
      const qEmbed = await embedModel.embedContent(question);
      const qVec = qEmbed.embedding.values;

      const scoredMemories = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(qVec, m.embedding) : 0,
        }))
        .sort((a, b) => b.score - a.score);

      const contextMemories = scoredMemories.slice(0, 30);
      const context = contextMemories
        .map(
          (m) =>
            `- [${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : ""}] ${m.text.slice(0, 500)}`,
        )
        .join("\n\n");

      const targetModelName = await getSmartModelName(apiKey);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: targetModelName });

      const prompt = `
        あなたはユーザーの「第二の脳」です。以下の【記憶データ】を参考に質問に答えてください。
        
        【重要指示】
        回答は必ず以下のJSON形式で行ってください。Markdownは不要です。
        {
          "answer": "質問への回答本文（丁寧な口調で）",
          "mermaid": "関連性や構造を図解するためのMermaid記法コード（グラフやフローチャート）。不要な場合はnull",
          "action": { "title": "カレンダー登録用の件名", "date": "YYYY-MM-DD HH:mm (推定日時)", "description": "詳細" } または null
        }

        【ユーザーの質問】${question}
        【記憶データ(関連順)】${context}
      `;

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      const cleanJson = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      let data;
      try {
        data = JSON.parse(cleanJson);
      } catch (e) {
        data = { answer: rawText, mermaid: null, action: null };
      }

      let actionUrl = "";
      if (data.action && data.action.title) {
        const baseUrl =
          "https://www.google.com/calendar/render?action=TEMPLATE";
        const textParam = `&text=${encodeURIComponent(data.action.title)}`;
        const detailsParam = `&details=${encodeURIComponent(data.action.description || "")}`;
        actionUrl = `${baseUrl}${textParam}${detailsParam}`;
      }

      const logData = {
        userId: currentUser.value.uid,
        question: question,
        answer: data.answer,
        mermaidCode: data.mermaid || null,
        action: actionUrl
          ? { title: data.action.title, url: actionUrl, date: data.action.date }
          : null,
        createdAt: serverTimestamp(),
      };

      const logRef = await addDoc(collection(db, "chat_logs"), logData);

      chatLogs.value.push({
        id: logRef.id,
        ...logData,
        createdAt: new Date(),
      } as any);

      return data.answer;
    } catch (e: any) {
      return "エラー: " + e.message;
    } finally {
      isAiThinking.value = false;
    }
  };

  const allTags = computed(() => {
    const tags = new Set<string>();
    memories.value.forEach((m) => {
      if (m.tags) m.tags.forEach((t) => tags.add(t));
    });
    return Array.from(tags);
  });

  return {
    currentUser,
    memories,
    filteredMemories,
    chatLogs,
    loading,
    isAiThinking,
    activeTag,
    allTags,
    initAuth,
    logout,
    addMemory,
    addUrlMemory,
    updateMemory,
    deleteMemory,
    askBrain,
    deleteChatLog,
    selectTag,
    startSubscription, // 追加
  };
}
