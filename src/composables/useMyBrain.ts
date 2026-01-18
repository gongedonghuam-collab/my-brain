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
import axios from "axios"; // 追加: モデル取得用

// ★設定項目
const STRIPE_PRICE_ID = "price_1SqvJAFjyhW5lKcrgAmd48sB";
const ADMIN_EMAILS = ["gongedonghuam@gmail.com"];

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

  // 動的に利用可能なモデルを取得する関数
  const getSmartModelName = async (apiKey: string): Promise<string> => {
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      // axiosを使うかfetchを使うか統一が必要ですが、ここではfetchで実装します
      const response = await fetch(listUrl);
      if (!response.ok) throw new Error("Model fetch failed");

      const data = await response.json();
      const models = data.models || [];

      const viableModels = models.filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      );

      const preferredOrder = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-pro",
      ];

      for (const pref of preferredOrder) {
        const found = viableModels.find((m: any) => m.name.includes(pref));
        if (found) return found.name.replace("models/", "");
      }

      if (viableModels.length > 0) {
        return viableModels[0].name.replace("models/", "");
      }

      return "gemini-1.5-flash";
    } catch (e) {
      console.warn("Model auto-detect failed, using default.", e);
      return "gemini-1.5-flash";
    }
  };

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

  // ★ここが復活しました
  const filteredMemories = computed(() => {
    if (!activeTag.value) return memories.value;
    return memories.value.filter((m) => m.tags?.includes(activeTag.value!));
  });

  const addMemory = async (text: string, file?: File | null) => {
    if (!(await checkAndIncrementUsage())) return null;
    isSaving.value = true;

    if (!currentUser.value) return null;

    try {
      const initText = file ? `(解析中...) ${text}` : text;
      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value.uid,
        text: initText,
        createdAt: serverTimestamp(),
        tags: [],
        aiSummary: "保存中...",
        hasImage: !!file,
        fileType: file?.type || null,
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        await updateDoc(docRef, { aiSummary: "APIキー未設定" });
        return null;
      }

      const modelName = await getSmartModelName(apiKey);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });

      let promptParts: any[] = [];
      if (file) {
        const filePart = await fileToGenerativePart(file);
        promptParts.push(filePart);
        promptParts.push({
          text: "画像を分析して。出力JSON:{summary, tags, fullText}",
        });
      } else {
        promptParts.push({
          text: `テキストを整理して。${text} 出力JSON:{summary, tags, fullText}`,
        });
      }

      const res = await model.generateContent(promptParts);
      let aiData;
      try {
        aiData = JSON.parse(res.response.text());
      } catch {
        aiData = { summary: text.substring(0, 30), tags: [], fullText: text };
      }

      const finalText = file
        ? `【解析済み】${text}\n\n${aiData.fullText || ""}`
        : text;

      const embModel = getEmbeddingModel(apiKey);
      const embResult = await embModel.embedContent(finalText);
      const embedding = embResult.embedding.values;

      await updateDoc(docRef, {
        text: finalText,
        aiSummary: aiData.summary,
        tags: aiData.tags,
        embedding: embedding,
      });

      memories.value.unshift({
        id: docRef.id,
        userId: currentUser.value.uid,
        text: finalText,
        aiSummary: aiData.summary,
        tags: aiData.tags,
        createdAt: new Date(),
        hasImage: !!file,
        fileType: file?.type,
        embedding: embedding,
      });

      return memories.value
        .filter((m) => m.id !== docRef.id && m.embedding)
        .map((m) => ({
          ...m,
          score: cosineSimilarity(embedding, m.embedding!),
        }))
        .filter((m) => m.score > 0.65)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } catch (e: any) {
      console.error("AI Error:", e);
      alert("AIエラー: " + e.message);
    } finally {
      isSaving.value = false;
    }
    return null;
  };

  const addUrlMemory = async (url: string) => {
    if (!(await checkAndIncrementUsage())) return;
    isSaving.value = true;
    try {
      const func = httpsCallable(getFunctions(), "scrapeUrl");
      const res: any = await func({ url });
      if (res.data.success) {
        await addMemory(
          `【WEB】${res.data.title}\nURL: ${url}\n\n${res.data.content}`,
        );
      }
    } catch (e: any) {
      alert("URL読込失敗: " + e.message);
    } finally {
      isSaving.value = false;
    }
  };

  const askBrain = async (question: string) => {
    if (!(await checkAndIncrementUsage())) return "";
    isAiThinking.value = true;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("APIキーがありません");

      const embedModel = getEmbeddingModel(apiKey);
      const qEmbed = await embedModel.embedContent(question);
      const qVec = qEmbed.embedding.values;

      const context = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(qVec, m.embedding) : 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((m) => `- ${m.text.slice(0, 300)}`)
        .join("\n");

      const modelName = await getSmartModelName(apiKey);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `あなたは「第2の脳」です。記憶データ:${context}\n質問:${question}\n回答はJSON形式 {"answer": "回答", "mermaid": "図解コード(任意)", "action": null} で。`;

      const res = await model.generateContent(prompt);
      let json;
      try {
        json = JSON.parse(
          res.response
            .text()
            .replace(/```json|```/g, "")
            .trim(),
        );
      } catch {
        json = { answer: res.response.text(), mermaid: null };
      }

      const log = {
        userId: currentUser.value!.uid,
        question,
        answer: json.answer,
        mermaidCode: json.mermaid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "chat_logs"), log);
      chatLogs.value.push({
        id: ref.id,
        ...log,
        createdAt: new Date(),
      } as any);
      return json.answer;
    } catch (e: any) {
      console.error(e);
      alert("AIエラー: " + e.message);
      return "エラーが発生しました";
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
    filteredMemories, // ← これを返すための定義を追加しました
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
    updateMemory,
    deleteMemory,
    askBrain,
    deleteChatLog,
    selectTag,
    startSubscription,
  };
}
