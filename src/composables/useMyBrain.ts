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
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import type { Memory, ChatLog, User, Todo, DailyReport } from "@/types";

const STRIPE_PRICE_ID = "price_1SqvJAFjyhW5lKcrgAmd48sB";
const ADMIN_EMAILS = ["gongedonghuam@gmail.com"];

const currentUser = ref<User | null>(null);
const memories = ref<Memory[]>([]);
const chatLogs = ref<ChatLog[]>([]);
const todos = ref<Todo[]>([]);
const dailyReports = ref<DailyReport[]>([]);
const loading = ref(false);
const isAiThinking = ref(false);
const isSaving = ref(false);
const isSpeaking = ref(false);
const activeTag = ref<string | null>(null);

// ヘルパー
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

const fetchCalendarEvents = async () => {
  const token = localStorage.getItem("google_calendar_token");
  if (!token) return null;
  try {
    const now = new Date().toISOString();
    const response = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=10&orderBy=startTime&singleEvents=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const events = response.data.items || [];
    if (events.length === 0) return "直近の予定はありません。";
    return events
      .map((ev: any) => {
        const start = ev.start.dateTime || ev.start.date;
        const summary = ev.summary || "(タイトルなし)";
        return `- ${start}: ${summary}`;
      })
      .join("\n");
  } catch (e) {
    console.warn("Calendar fetch failed:", e);
    return null;
  }
};

const addEventToGoogleCalendar = async (
  title: string,
  startDateTime: string,
  endDateTime: string,
  colorId?: string,
) => {
  const token = localStorage.getItem("google_calendar_token");
  if (!token) throw new Error("連携トークンがありません。");
  const event = {
    summary: title,
    start: { dateTime: startDateTime },
    end: { dateTime: endDateTime },
    colorId: colorId || "9",
  };
  try {
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      event,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (e: any) {
    if (e.response && e.response.status === 401) {
      throw new Error("認証の有効期限が切れています。再ログインしてください。");
    }
    throw e;
  }
};

// 音声読み上げ
const speakText = (text: string) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 1.2;
  utterance.pitch = 1.0;
  utterance.onstart = () => {
    isSpeaking.value = true;
  };
  utterance.onend = () => {
    isSpeaking.value = false;
  };
  utterance.onerror = () => {
    isSpeaking.value = false;
  };
  window.speechSynthesis.speak(utterance);
};

export function useMyBrain() {
  const getEmbeddingModel = (apiKey: string) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "text-embedding-004" });
  };

  const getSmartModelName = async (apiKey: string): Promise<string> => {
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
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
      if (viableModels.length > 0)
        return viableModels[0].name.replace("models/", "");
      return "gemini-1.5-flash";
    } catch (e) {
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
      alert("本日の無料枠（5回）を使い切りました。");
      return false;
    }
    await updateDoc(userRef, {
      dailyUsage: increment(1),
      lastUsageDate: todayStr,
    });
    return true;
  };

  // ★修正: ToDo自動抽出（JSONクリーニング強化）
  const generateTasksFromMemory = async (memoryId: string, text: string) => {
    if (!currentUser.value) return;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
      const prompt = `以下のメモから「やるべきこと（ToDo）」を抽出しJSONで返して。
        { "tasks": ["タスク1", "タスク2"] }
        メモ: ${text}`;

      const result = await model.generateContent(prompt);

      // ★Markdown記法を除去してパースする
      const rawText = result.response.text();
      const jsonStr = rawText.replace(/```json|```/g, "").trim();

      let data;
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        console.error("JSON Parse Error in Tasks:", e);
        data = { tasks: [] };
      }

      const tasks: string[] = data.tasks || [];

      if (tasks.length > 0) {
        const batch = writeBatch(db);
        tasks.forEach((taskTitle) => {
          const newRef = doc(collection(db, "todos"));
          batch.set(newRef, {
            userId: currentUser.value!.uid,
            title: taskTitle,
            isCompleted: false,
            sourceMemoryId: memoryId,
            createdAt: serverTimestamp(),
          });
        });
        await batch.commit();
        console.log("Tasks generated:", tasks);
      }
    } catch (e) {
      console.error("ToDo generation failed:", e);
    }
  };

  const generateDailyReport = async () => {
    if (!currentUser.value) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    const q = query(
      collection(db, "daily_reports"),
      where("userId", "==", currentUser.value.uid),
      where("date", "==", dateStr),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return;

    const start = new Date(dateStr);
    const end = new Date(dateStr);
    end.setDate(end.getDate() + 1);

    const memQ = query(
      collection(db, "memories"),
      where("userId", "==", currentUser.value.uid),
      where("createdAt", ">=", start),
      where("createdAt", "<", end),
    );
    const memSnap = await getDocs(memQ);
    const dailyMemories = memSnap.docs
      .map((d) => d.data().text)
      .join("\n---\n");

    if (!dailyMemories) return;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
      const prompt = `昨日のメモを元に日刊レポートを作成。出力JSON: { "content": "総括", "highlights": ["要点1"] }\nメモ: ${dailyMemories}`;
      const result = await model.generateContent(prompt);

      const rawText = result.response.text();
      const jsonStr = rawText.replace(/```json|```/g, "").trim();
      const data = JSON.parse(jsonStr);

      await addDoc(collection(db, "daily_reports"), {
        userId: currentUser.value.uid,
        date: dateStr,
        content: data.content,
        highlights: data.highlights || [],
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Report generation failed:", e);
    }
  };

  const startSubscription = async () => {
    if (!currentUser.value) return;
    const confirmed = confirm(
      "PROプラン（月額1,000円）の決済画面へ移動しますか？",
    );
    if (!confirmed) return;
    alert("決済画面を準備しています...");
    try {
      const docRef = await addDoc(
        collection(db, "users", currentUser.value.uid, "checkout_sessions"),
        {
          price: STRIPE_PRICE_ID,
          success_url: window.location.origin + "/app",
          cancel_url: window.location.origin + "/app",
        },
      );
      onSnapshot(docRef, (snap) => {
        const data = snap.data();
        if (data?.url) window.location.assign(data.url);
      });
    } catch (e: any) {
      alert("エラーが発生しました: " + e.message);
    }
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
        // データの初期読み込みと監視
        await Promise.all([
          fetchMemories(),
          fetchChatLogs(),
          fetchTodos(),
          fetchReports(),
        ]);
        generateDailyReport();
      } else {
        currentUser.value = null;
        memories.value = [];
        chatLogs.value = [];
        todos.value = [];
        dailyReports.value = [];
      }
    });
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("google_calendar_token");
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
      console.error(e);
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
      console.error(e);
    }
  };

  const fetchTodos = async () => {
    if (!currentUser.value) return;
    try {
      const q = query(
        collection(db, "todos"),
        where("userId", "==", currentUser.value.uid),
        orderBy("createdAt", "desc"),
      );
      onSnapshot(q, (snap) => {
        todos.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Todo);
      });
    } catch (e) {
      console.error("Fetch todos error:", e);
    }
  };

  const fetchReports = async () => {
    if (!currentUser.value) return;
    const q = query(
      collection(db, "daily_reports"),
      where("userId", "==", currentUser.value.uid),
      orderBy("createdAt", "desc"),
      limit(5),
    );
    onSnapshot(q, (snap) => {
      dailyReports.value = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as DailyReport,
      );
    });
  };

  const selectTag = async (tag: string | null) => {
    activeTag.value = tag;
  };
  const filteredMemories = computed(() => {
    if (!activeTag.value) return memories.value;
    return memories.value.filter((m) => m.tags?.includes(activeTag.value!));
  });

  const findRelatedMemories = async (text: string): Promise<Memory[]> => {
    if (!text.trim() || memories.value.length === 0) return [];
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) return [];
      const genAI = new GoogleGenerativeAI(apiKey);

      const embedModel = genAI.getGenerativeModel({
        model: "text-embedding-004",
      });
      const result = await embedModel.embedContent(text);
      const vec = result.embedding.values;

      const candidates = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(vec, m.embedding) : 0,
        }))
        .filter((m) => m.score && m.score > 0.45)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10);

      if (candidates.length === 0) return [];

      const modelName = await getSmartModelName(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });

      const candidatesText = candidates
        .map((c) => `ID: ${c.id}\n内容: ${c.aiSummary || c.text.slice(0, 100)}`)
        .join("\n---\n");
      const prompt = `検索クエリ: ${text}\n候補:\n${candidatesText}\n文脈的に関連するIDを選んでJSONで返して: { "selectedIds": ["ID"] }`;

      const aiRes = await model.generateContent(prompt);
      const aiJson = JSON.parse(aiRes.response.text());
      const selectedIds: string[] = aiJson.selectedIds || [];

      const finalResults = candidates.filter((c) => selectedIds.includes(c.id));
      const highConfidenceResults = candidates.filter(
        (c) => (c.score || 0) > 0.85 && !selectedIds.includes(c.id),
      );
      const merged = [...finalResults, ...highConfidenceResults];
      const uniqueResults = Array.from(
        new Map(merged.map((m) => [m.id, m])).values(),
      );

      return uniqueResults.slice(0, 3);
    } catch (e) {
      return [];
    }
  };

  const addMemory = async (text: string, file?: File | null) => {
    if (!(await checkAndIncrementUsage())) return null;
    isSaving.value = true;
    if (!currentUser.value) return null;
    try {
      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value.uid,
        text: file ? `(解析中...) ${text}` : text,
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
        promptParts.push(await fileToGenerativePart(file));
        promptParts.push({
          text: "画像を分析して。出力JSON:{summary, tags, fullText}",
        });
      } else {
        promptParts.push({
          text: `以下のテキストを整理して。${text} 出力JSON:{summary, tags, fullText}`,
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

      // ★タスク生成を実行
      generateTasksFromMemory(docRef.id, finalText);

      return memories.value
        .filter((m) => m.id !== docRef.id && m.embedding)
        .map((m) => ({
          ...m,
          score: cosineSimilarity(embedding, m.embedding!),
        }))
        .filter((m) => m.score > 0.65)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } catch (e) {
      alert("保存エラー");
      return null;
    } finally {
      isSaving.value = false;
    }
  };

  const addUrlMemory = async (url: string) => {
    if (!(await checkAndIncrementUsage())) return;
    isSaving.value = true;
    try {
      const func = httpsCallable(getFunctions(), "scrapeUrl");
      const res: any = await func({ url });
      if (res.data.success) {
        await addMemory(
          `【WEB記事】${res.data.title}\nURL: ${url}\n\n${res.data.content}`,
        );
      }
    } catch (e: any) {
      alert("エラー: " + e.message);
    } finally {
      isSaving.value = false;
    }
  };

  const askBrain = async (
    question: string,
    voiceMode: boolean = false,
  ): Promise<string> => {
    if (!(await checkAndIncrementUsage())) return "";
    isAiThinking.value = true;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("APIキー未設定");
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
      const calendarEvents = await fetchCalendarEvents();
      const calendarContext = calendarEvents
        ? `\n【直近の予定】\n${calendarEvents}\n`
        : "";
      const nowStr = new Date().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      });

      const modelName = await getSmartModelName(apiKey);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `あなたは「第2の脳」。現在日時: ${nowStr}\n${calendarContext}\n【記憶】\n${context}\n【質問】${question}\n出力JSON: { "answer": "回答", "mermaid": null, "calendarAction": null }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      let data;
      try {
        data = JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        data = { answer: text, mermaid: null, calendarAction: null };
      }

      let finalAnswer = data.answer;
      if (data.calendarAction) {
        try {
          await addEventToGoogleCalendar(
            data.calendarAction.title,
            data.calendarAction.start,
            data.calendarAction.end,
            data.calendarAction.colorId,
          );
          finalAnswer += `\n\n✅ 予定登録: ${data.calendarAction.title}`;
        } catch (e: any) {
          finalAnswer += `\n⚠️ エラー: ${e.message}`;
        }
      }

      const logData = {
        userId: currentUser.value!.uid,
        question: question,
        answer: finalAnswer,
        mermaidCode: data.mermaid || null,
        createdAt: serverTimestamp(),
      };
      const logRef = await addDoc(collection(db, "chat_logs"), logData);

      // アニメーション用フラグを追加してチャットログに保存
      chatLogs.value.push({
        id: logRef.id,
        ...logData,
        createdAt: new Date(),
        displayAnswer: "",
        isAnimating: true,
      } as any);

      // ★修正: voiceModeがtrueの時だけ喋る
      if (voiceMode) {
        speakText(finalAnswer);
      }

      return finalAnswer;
    } catch (e: any) {
      return "エラー: " + e.message;
    } finally {
      isAiThinking.value = false;
    }
  };

  const updateMemory = async (id: string, newText: string) => {
    await updateDoc(doc(db, "memories", id), { text: newText });
  };
  const deleteMemory = async (id: string) => {
    if (confirm("削除?")) {
      await deleteDoc(doc(db, "memories", id));
      memories.value = memories.value.filter((m) => m.id !== id);
    }
  };
  const deleteChatLog = async (id: string) => {
    await deleteDoc(doc(db, "chat_logs", id));
    chatLogs.value = chatLogs.value.filter((l) => l.id !== id);
  };
  const toggleTodo = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, "todos", id), { isCompleted: !currentStatus });
  };
  const deleteTodo = async (id: string) => {
    await deleteDoc(doc(db, "todos", id));
  };

  const allTags = computed(() => {
    const tags = new Set<string>();
    memories.value.forEach((m) => m.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags);
  });

  return {
    currentUser,
    memories,
    filteredMemories,
    chatLogs,
    todos,
    dailyReports,
    loading,
    isAiThinking,
    isSaving,
    isSpeaking,
    activeTag,
    allTags,
    initAuth,
    logout,
    addMemory,
    addUrlMemory,
    askBrain,
    selectTag,
    startSubscription,
    updateMemory,
    deleteMemory,
    deleteChatLog,
    findRelatedMemories,
    toggleTodo,
    deleteTodo,
    speakText,
  };
}
