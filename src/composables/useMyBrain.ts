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
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
}

const currentUser = ref<User | null>(null);
const memories = ref<Memory[]>([]);
const chatLogs = ref<ChatLog[]>([]);
const loading = ref(false);
const isAiThinking = ref(false);
const activeTag = ref<string | null>(null);

// 画像Base64変換
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

// コサイン類似度計算
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
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const listResponse = await fetch(listUrl);
      if (!listResponse.ok) return "gemini-1.5-flash";
      const listData = await listResponse.json();
      const generationModels = (listData.models || []).filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      );
      const flash = generationModels.find((m: any) =>
        m.name.includes("gemini-1.5-flash"),
      );
      const targetModelObj = flash || generationModels[0];
      return targetModelObj?.name.replace("models/", "") || "gemini-1.5-flash";
    } catch (e) {
      return "gemini-1.5-flash";
    }
  };

  const initAuth = () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          currentUser.value = {
            uid: user.uid,
            email: user.email || "",
            displayName: data.displayName,
            photoURL: user.photoURL || undefined,
          };
        } else {
          const newUser = {
            uid: user.uid,
            email: user.email || "",
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, "users", user.uid), newUser);
          currentUser.value = newUser;
        }
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

  // 2. データ取得
  const fetchMemories = async () => {
    if (!currentUser.value) return;
    loading.value = true;
    try {
      // ★修正: limit(500) を削除し、全件取得するように変更
      // ※件数が多い場合、初回の読み込みに少し時間がかかる可能性がありますが、
      // 取得後はクライアント側でキャッシュされるため高速に動作します。
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
        limit(50), // チャット履歴は表示用なので50件制限のままでOK
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

  // 3. メモ追加
  const addMemory = async (text: string, file?: File | null) => {
    if (!currentUser.value) return;
    isAiThinking.value = true;

    try {
      const isImage = file?.type.startsWith("image/");
      const isPdf = file?.type === "application/pdf";
      const fileTypeLabel = isImage ? "画像" : isPdf ? "PDF" : "ファイル";
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
          promptParts.push({
            text: `
            画像/資料を分析して記憶データを作成してください。
            ユーザーメモ: ${text}
            出力形式: JSON {"summary": "20字要約", "tags": ["タグ"], "fullText": "全テキスト"}
          `,
          });
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
        };
        memories.value.unshift(newMem);
      }
    } catch (e) {
      console.error("Add memory error:", e);
      alert("保存エラー");
    } finally {
      isAiThinking.value = false;
    }
  };

  const addUrlMemory = async (url: string) => {
    if (!currentUser.value) return;
    isAiThinking.value = true;

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

  // 4. チャット機能
  const askBrain = async (question: string): Promise<string> => {
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
  };
}
