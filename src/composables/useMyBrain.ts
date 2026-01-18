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

// ★設定項目 (ID等を書き換えてください)
const STRIPE_PRICE_ID = "price_1SqvJAFjyhW5lKcrgAmd48sB "; // あなたのStripe価格IDに変更してください
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
  isPro?: boolean;
  dailyUsage?: number;
  lastUsageDate?: string;
  stripeId?: string;
  role?: string;
  isLineLinked?: boolean;
}

const currentUser = ref<User | null>(null);
const memories = ref<Memory[]>([]);
const chatLogs = ref<ChatLog[]>([]);
const loading = ref(false);
const isAiThinking = ref(false);
const isSaving = ref(false);
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

// コサイン類似度
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
    // 常にFlashモデルを使用（コスト対策）
    return "gemini-1.5-flash";
  };

  // ----------------------------------------------------
  // ▼ 1. 課金・制限ロジック
  // ----------------------------------------------------
  const checkAndIncrementUsage = async (): Promise<boolean> => {
    if (!currentUser.value) return false;
    if (currentUser.value.isPro) return true;

    const todayStr = new Date().toISOString().split("T")[0];
    const userRef = doc(db, "users", currentUser.value.uid);
    const snap = await getDoc(userRef);
    const data = snap.data();

    let currentCount = 0;
    if (data?.lastUsageDate !== todayStr) {
      currentCount = 0;
      await updateDoc(userRef, { dailyUsage: 0, lastUsageDate: todayStr });
    } else {
      currentCount = data?.dailyUsage || 0;
    }

    if (currentCount >= 5) {
      alert(
        "本日の無料枠（5回）を使い切りました。\nProプランで無制限に解放しましょう！🚀",
      );
      return false;
    }

    await updateDoc(userRef, {
      dailyUsage: increment(1),
      lastUsageDate: todayStr,
    });
    return true;
  };

  const startSubscription = async () => {
    if (!currentUser.value) return;
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
    onSnapshot(docRef, (snap) => {
      const { url } = snap.data() || {};
      if (url) window.location.assign(url);
    });
  };

  // ----------------------------------------------------
  // ▼ 2. 認証・初期化
  // ----------------------------------------------------
  const initAuth = () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser.value = {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || undefined,
          photoURL: user.photoURL || undefined,
          isPro: false,
          dailyUsage: 0,
          isLineLinked: false,
        };

        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          const data = docSnap.data();
          if (data && currentUser.value) {
            const isAdmin = ADMIN_EMAILS.includes(user.email || "");
            const isSubscribed =
              !!data.stripeId || data.role === "pro" || isAdmin;

            currentUser.value = {
              ...currentUser.value,
              displayName: data.displayName || currentUser.value.displayName,
              isPro: isSubscribed,
              dailyUsage: data.dailyUsage || 0,
              lastUsageDate: data.lastUsageDate,
              stripeId: data.stripeId,
              role: data.role,
              isLineLinked: data.isLineLinked || false,
            };
          }
        });

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
      let q = query(
        collection(db, "memories"),
        where("userId", "==", currentUser.value.uid),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      memories.value = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Memory,
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
  // ▼ 4. メモ追加 (保存中ステータス・リコメンド)
  // ----------------------------------------------------
  const addMemory = async (text: string, file?: File | null) => {
    if (!(await checkAndIncrementUsage())) return null;
    isSaving.value = true; // ★保存開始

    if (!currentUser.value) return null;

    try {
      const isAudio = file?.type.startsWith("audio/");
      const initText = file ? `(解析中...) ${text}` : text;

      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value.uid,
        text: initText,
        createdAt: serverTimestamp(),
        tags: [],
        aiSummary: "AI処理中...",
        hasImage: !!file,
        fileType: file?.type || null,
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
          generationConfig: { responseMimeType: "application/json" },
        });

        let promptParts: any[] = [];
        if (file) {
          const filePart = await fileToGenerativePart(file);
          promptParts.push(filePart);
          if (isAudio) {
            promptParts.push({
              text: `音声データです。書き起こしと要約とタスク抽出をして。ユーザーメモ:${text} 出力JSON:{summary, tags, fullText}`,
            });
          } else {
            promptParts.push({
              text: `画像/PDFです。内容を分析して。ユーザーメモ:${text} 出力JSON:{summary, tags, fullText}`,
            });
          }
        } else {
          promptParts.push({
            text: `以下のテキストを整理・分析して。${text} 出力JSON:{summary, tags, fullText}`,
          });
        }

        const result = await model.generateContent(promptParts);
        const aiData = JSON.parse(result.response.text());
        const finalContent = file
          ? `【解析済み】${text}\n\n${aiData.fullText}`
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

        // リコメンド
        const relatedMemories = memories.value
          .filter((m) => m.id !== docRef.id && m.embedding)
          .map((m) => ({
            ...m,
            score: m.embedding ? cosineSimilarity(embedding, m.embedding) : 0,
          }))
          .filter((m) => m.score > 0.65)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        return relatedMemories;
      }
    } catch (e) {
      console.error("Add memory error:", e);
      alert("保存エラー");
      return null;
    } finally {
      isSaving.value = false; // ★保存終了
    }
    return null;
  };

  const addUrlMemory = async (url: string) => {
    if (!(await checkAndIncrementUsage())) return;
    isSaving.value = true;
    try {
      const functions = getFunctions();
      const scrapeFunc = httpsCallable(functions, "scrapeUrl");
      const result: any = await scrapeFunc({ url });

      if (result.data.success) {
        const { title, content } = result.data;
        const fullText = `【WEB記事】${title}\nURL: ${url}\n\n${content}`;
        await addMemory(fullText);
      }
    } catch (e: any) {
      alert("記事の読み込みに失敗しました: " + e.message);
    } finally {
      isSaving.value = false;
    }
  };

  const askBrain = async (question: string): Promise<string> => {
    if (!(await checkAndIncrementUsage())) return "";
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

      const context = scoredMemories
        .slice(0, 20)
        .map((m) => `- ${m.text.slice(0, 500)}`)
        .join("\n\n");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `あなたは「第2の脳」です。記憶データ:${context}\n質問:${question}\n回答はJSON形式 {"answer": "回答", "mermaid": "図解コード(任意)", "action": null} で。`;

      const result = await model.generateContent(prompt);
      const data = JSON.parse(
        result.response
          .text()
          .replace(/```json|```/g, "")
          .trim(),
      );

      const logData = {
        userId: currentUser.value!.uid,
        question: question,
        answer: data.answer,
        mermaidCode: data.mermaid || null,
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
    isSaving,
    activeTag,
    allTags,
    initAuth,
    logout,
    addMemory,
    addUrlMemory,
    askBrain,
    selectTag,
    startSubscription,
    // ▼ ここに追加しました！
    updateMemory,
    deleteMemory,
    deleteChatLog,
  };
}
