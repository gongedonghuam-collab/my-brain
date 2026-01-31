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
import {
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import type { Memory, ChatLog, User, Todo, DailyReport } from "@/types";

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/6oU28r4Hi71dglzd1z6AM00";
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
const isCalendarConnected = ref(true);

// ★重要: 短期記憶（直前に触ったメモID）をlocalStorageで永続化
const lastReferencedMemoryId = ref<string | null>(
  localStorage.getItem("last_memory_id"),
);

const setLastMemoryId = (id: string | null) => {
  // IDが空文字やundefinedでない場合のみ更新
  if (id) {
    // IDクリーニングしてから保存
    const clean = id.replace(/<<<|>>>|ID:/gi, "").trim();
    lastReferencedMemoryId.value = clean;
    localStorage.setItem("last_memory_id", clean);
    console.log("🧠 Context Updated: Active Memory ID =", clean);
  }
};

// ---------------- Helper Functions ----------------

function cleanId(id: string): string {
  if (!id || typeof id !== "string") return "";
  return id.replace(/<<<|>>>|ID:/gi, "").trim();
}

const callGoogleApi = async (callback: (token: string) => Promise<any>) => {
  let token = localStorage.getItem("google_calendar_token");
  if (!token) {
    isCalendarConnected.value = false;
    return null;
  }
  try {
    const res = await callback(token);
    isCalendarConnected.value = true;
    return res;
  } catch (e: any) {
    if (e.response && e.response.status === 401) {
      localStorage.removeItem("google_calendar_token");
      isCalendarConnected.value = false;
      return null;
    }
    throw e;
  }
};

const reconnectCalendar = async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar");
    provider.setCustomParameters({
      prompt: "select_account consent",
      access_type: "offline",
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (token) {
      localStorage.setItem("google_calendar_token", token);
      isCalendarConnected.value = true;
      alert("カレンダーを再接続しました！");
      window.location.reload();
    }
  } catch (e: any) {
    console.error("Reconnect Error:", e);
    alert("再接続に失敗しました: " + e.message);
  }
};

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

function extractJson(text: string): string {
  let clean = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const firstOpen = clean.indexOf("{");
  const lastClose = clean.lastIndexOf("}");
  if (firstOpen !== -1 && lastClose !== -1) {
    return clean.substring(firstOpen, lastClose + 1);
  }
  return clean;
}

// ---------------------------------------------------------
// Helper: AI Model Management
// ---------------------------------------------------------

const fetchAvailableModels = async (apiKey: string) => {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await fetch(listUrl);
    if (!listResponse.ok) return [];
    const listData = await listResponse.json();
    return listData.models || [];
  } catch (e) {
    console.warn("Failed to fetch model list:", e);
    return [];
  }
};

const resolveGeminiModel = async (apiKey: string): Promise<string> => {
  const models = await fetchAvailableModels(apiKey);
  const generationModels = models.filter((m: any) =>
    m.supportedGenerationMethods?.includes("generateContent"),
  );
  // フロントエンドでは応答速度重視でFlashを優先
  let target = generationModels.find((m: any) =>
    m.name.includes("gemini-1.5-flash"),
  );
  if (!target) {
    target = generationModels.find((m: any) =>
      m.name.includes("gemini-1.5-pro"),
    );
  }
  if (!target && generationModels.length > 0) {
    target = generationModels[0];
  }
  if (target) {
    return target.name.replace("models/", "");
  }
  return "gemini-1.5-flash";
};

const getEmbeddingModel = async (apiKey: string) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const models = await fetchAvailableModels(apiKey);
    const embeddingModels = models.filter((m: any) =>
      m.supportedGenerationMethods?.includes("embedContent"),
    );
    let target = embeddingModels.find((m: any) =>
      m.name.includes("text-embedding-004"),
    );
    if (!target) {
      target = embeddingModels.find((m: any) =>
        m.name.includes("embedding-001"),
      );
    }
    if (!target && embeddingModels.length > 0) {
      target = embeddingModels[0];
    }
    const modelName = target
      ? target.name.replace("models/", "")
      : "embedding-001";
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    return genAI.getGenerativeModel({ model: "embedding-001" });
  }
};

const generateContentWithRetry = async (
  apiKey: string,
  promptParts: any[],
  isJsonMode = false,
) => {
  try {
    const modelName = await resolveGeminiModel(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    // JSONモードはエラー回避のためフロントエンドでも無効化し、プロンプトで強制する
    const config = {};
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: config,
    });
    const result = await model.generateContent(promptParts);
    return result.response.text();
  } catch (e: any) {
    console.error("AI Generation Error (Primary):", e);
    try {
      console.log("Retrying with gemini-pro...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContent(promptParts);
      return result.response.text();
    } catch (retryError: any) {
      throw new Error("AI processing failed completely: " + retryError.message);
    }
  }
};

const fetchCalendarEvents = async () => {
  return await callGoogleApi(async (token) => {
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
  });
};

const addEventToGoogleCalendar = async (
  title: string,
  startDateTime: string,
  endDateTime: string,
  colorId?: string,
) => {
  await callGoogleApi(async (token) => {
    const event = {
      summary: title,
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
      colorId: colorId || "9",
    };
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      event,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  });
};

const deleteCalendarEvent = async (query: string) => {
  return await callGoogleApi(async (token) => {
    const searchRes = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query, maxResults: 5, singleEvents: true },
      },
    );
    const events = searchRes.data.items || [];
    if (events.length === 0) return false;

    const target = events[0];
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return target.summary;
  });
};

const deleteTodoByTitle = async (title: string) => {
  const todosRef = collection(db, "todos");
  const q = query(
    todosRef,
    where("userId", "==", currentUser.value!.uid),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  const target = snap.docs.find((d) => d.data().title.includes(title));

  if (target) {
    await deleteDoc(doc(db, "todos", target.id));
    return target.data().title;
  }
  return null;
};

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

// ---------------- Main Composable ----------------

export function useMyBrain() {
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

  const generateTasksFromMemory = async (memoryId: string, text: string) => {
    if (!currentUser.value) return;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const prompt = `以下のメモから「やるべきこと（ToDo）」を抽出しJSONで返して。
        { "tasks": ["タスク1", "タスク2"] }
        メモ: ${text}`;
      const rawText = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(rawText));
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
      }
    } catch (e) {
      console.error("ToDo generation failed:", e);
    }
  };

  const addManualTodo = async (title: string) => {
    if (!currentUser.value || !title.trim()) return;
    try {
      await addDoc(collection(db, "todos"), {
        userId: currentUser.value.uid,
        title: title,
        isCompleted: false,
        sourceMemoryId: null,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
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
      const prompt = `昨日のメモを元に日刊レポートを作成。出力JSON: { "content": "総括", "highlights": ["要点1"] }\nメモ: ${dailyMemories}`;
      const rawText = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(rawText));

      await addDoc(collection(db, "daily_reports"), {
        userId: currentUser.value.uid,
        date: dateStr,
        content: data.content,
        highlights: data.highlights || [],
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const startSubscription = async () => {
    if (!currentUser.value) return;
    if (confirm("PROプラン（月額980円）の決済画面へ移動しますか？")) {
      window.location.href = STRIPE_PAYMENT_LINK;
    }
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
  };

  const fetchTodos = async () => {
    if (!currentUser.value) return;
    const q = query(
      collection(db, "todos"),
      where("userId", "==", currentUser.value.uid),
      orderBy("createdAt", "desc"),
    );
    onSnapshot(q, (snap) => {
      todos.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Todo);
    });
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
        // ログアウト時に記憶もリセット
        localStorage.removeItem("last_memory_id");
        lastReferencedMemoryId.value = null;
      }
    });
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("google_calendar_token");
    localStorage.removeItem("last_memory_id");
    window.location.reload();
  };

  const selectTag = async (tag: string | null) => {
    activeTag.value = tag;
  };
  const filteredMemories = computed(() => {
    if (!activeTag.value) return memories.value;
    return memories.value.filter((m) => m.tags?.includes(activeTag.value!));
  });

  const allTags = computed(() => {
    const tags = new Set<string>();
    memories.value.forEach((m) => m.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags);
  });

  const findRelatedMemories = async (text: string): Promise<Memory[]> => {
    if (!text.trim() || memories.value.length === 0) return [];
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) return [];

      const embedModel = await getEmbeddingModel(apiKey);
      const result = await embedModel.embedContent(text);
      const vec = result.embedding.values;

      const threshold = 0.55;

      const vecCandidates = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(vec, m.embedding) : 0,
        }))
        .filter((m) => m.score && m.score > threshold)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      const latestMemories = memories.value
        .slice(0, 5)
        .map((m) => ({ ...m, score: 1.0 }));

      const keywords = text.split(/[\s,、　]+/);
      const keywordCandidates = memories.value
        .filter((m) => keywords.some((k) => k.length > 1 && m.text.includes(k)))
        .slice(0, 3)
        .map((m) => ({ ...m, score: 0.9 }));

      const allCandidates = [
        ...latestMemories,
        ...vecCandidates,
        ...keywordCandidates,
      ];
      const uniqueCandidates = Array.from(
        new Map(allCandidates.map((item) => [item.id, item])).values(),
      );

      if (uniqueCandidates.length === 0) return [];

      const verifyPrompt = `
        以下の【検索クエリ】に対して、【候補メモ】の中から本当に関連性が高いものだけを選んでください。
        「買い物リスト」や「タスク」などのキーワードがある場合は、日付が新しくても古くても関連するものを選んでください。
        全く関係ない場合は空の配列を返してください。

        【検索クエリ】
        ${text}
        【候補メモ】
        ${uniqueCandidates.map((c, i) => `${i} (ID:${c.id}): ${c.text}`).join("\n")}
        
        出力はJSON形式のみ: { "indices": [0, 2] } 
      `;

      const verifyRes = await generateContentWithRetry(
        apiKey,
        [{ text: verifyPrompt }],
        true,
      );
      const verifyJson = JSON.parse(extractJson(verifyRes));
      const validIndices: number[] = verifyJson.indices || [];

      return uniqueCandidates.filter((_, i) => validIndices.includes(i));
    } catch (e) {
      console.error("Search Error:", e);
      return [];
    }
  };

  const addMemory = async (text: string, files?: File[] | null) => {
    if (!(await checkAndIncrementUsage())) return null;
    isSaving.value = true;
    try {
      const hasImages = files && files.length > 0;
      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value!.uid,
        text: hasImages ? `(解析中...) ${text}` : text,
        createdAt: serverTimestamp(),
        tags: [],
        aiSummary: "保存中...",
        hasImage: !!hasImages,
        fileType: hasImages ? "image/jpeg" : null,
      });

      // ★保存したIDを短期記憶にセット
      setLastMemoryId(docRef.id);

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      let promptParts: any[] = [];
      if (hasImages) {
        const imageParts = await Promise.all(
          files!.map((f) => fileToGenerativePart(f)),
        );
        promptParts.push(...imageParts);
        promptParts.push({
          text: `画像を分析して。出力JSON:{summary, tags, fullText}`,
        });
      } else {
        promptParts.push({
          text: `以下のテキストを整理して。${text} 出力JSON:{summary, tags, fullText}`,
        });
      }

      const resText = await generateContentWithRetry(apiKey, promptParts, true);
      const aiData = JSON.parse(extractJson(resText));

      const finalText = hasImages
        ? `【解析済み】${text}\n\n${aiData.fullText || ""}`
        : text;

      const embModel = await getEmbeddingModel(apiKey);
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
        userId: currentUser.value!.uid,
        text: finalText,
        aiSummary: aiData.summary,
        tags: aiData.tags,
        createdAt: new Date(),
        hasImage: !!hasImages,
        fileType: hasImages ? "image/jpeg" : null,
        embedding: embedding,
      });
      generateTasksFromMemory(docRef.id, finalText);
      return [];
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
      const func = httpsCallable(
        getFunctions(getApp(), "asia-northeast1"),
        "scrapeUrl",
      );
      const res: any = await func({ url });
      if (res.data.success) {
        await addMemory(
          `【WEB記事】${res.data.title}\nURL: ${url}\n\n${res.data.content}`,
          null,
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

      const embedModel = await getEmbeddingModel(apiKey);
      const qEmbed = await embedModel.embedContent(question);
      const qVec = qEmbed.embedding.values;

      const threshold = 0.55;

      const vecCandidates = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(qVec, m.embedding) : 0,
        }))
        .filter((m) => m.score && m.score > threshold)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      const latestMemories = memories.value
        .slice(0, 5)
        .map((m) => ({ ...m, score: 1.0 }));

      const keywords = question.split(/[\s,、　]+/);
      const keywordCandidates = memories.value
        .filter((m) => keywords.some((k) => k.length > 1 && m.text.includes(k)))
        .slice(0, 3)
        .map((m) => ({ ...m, score: 0.9 }));

      const allCandidates = [
        ...latestMemories,
        ...vecCandidates,
        ...keywordCandidates,
      ];
      const uniqueCandidates = Array.from(
        new Map(allCandidates.map((item) => [item.id, item])).values(),
      );

      const context = uniqueCandidates
        .map((m) => `ID:${m.id} | ${m.text.slice(0, 300)}`)
        .join("\n");

      // 直近の会話履歴を取得
      const recentHistory = chatLogs.value
        .slice(-5)
        .map((log) => `User: ${log.question}\nAI: ${log.answer}`)
        .join("\n---\n");

      const calendarEvents = await fetchCalendarEvents();
      const calendarContext = calendarEvents
        ? `\n【直近の予定】\n${calendarEvents}\n`
        : "";
      const nowStr = new Date().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      });

      // ★プロンプト強化: 直前のIDを注入
      const prompt = `
        あなたはユーザーの「第2の脳」です。現在日時: ${nowStr}
        ${calendarContext}
        
        【直近の会話履歴】(文脈を理解してください)
        ${recentHistory}

        【参照する記憶(ID付き)】
        ${context}
        
        【直前に触ったメモID】: ${lastReferencedMemoryId.value ? `<<<${lastReferencedMemoryId.value}>>>` : "なし"}

        【ユーザー入力】
        ${question}

        【指示】
        ユーザーの意図を汲み取り、適切なアクションを選択してください。
        「これ」「あれ」「さっきの」といった指示語がある場合、「直前に触ったメモID」を優先して対象にしてください。
        もし回答に使用したメモがある場合は、そのIDを targetId に必ず含めてください。
        
        判断基準:
        - 【編集・削除】 "メモの〇〇を消して" "〜に変更して" -> MEMORY_EDIT
             ※この場合、変更後の**全文**を data.newContent に入れてください。
             targetId は【参照する記憶】のID、または【直前に触ったメモID】を使ってください。
        - 【メモ追記】 "これ追加して" "買っておいて" -> MEMORY_APPEND
        - 【タスク削除】 "タスク消して" "完了した" -> TASK_DELETE
        - 【タスク追加】 "タスク" "ToDo" "〜する" -> TASK_ADD
        - 【予定削除】 "予定消して" "キャンセル" -> CALENDAR_DELETE
        - 【予定追加】 日時指定("明日10時"など) -> CALENDAR_ADD
        - 【メモ保存】 ただの記録 -> MEMORY_ADD
        - それ以外 -> CHAT (メモを参照した場合は targetId を入れること)

        出力はJSON形式のみ:
        {
          "action": "CALENDAR_ADD" | "CALENDAR_DELETE" | "TASK_ADD" | "TASK_DELETE" | "MEMORY_APPEND" | "MEMORY_EDIT" | "MEMORY_ADD" | "CHAT",
          "data": {
            "title": "予定/タスク名",
            "start": "日時(ISO)",
            "end": "日時(ISO)",
            "targetId": "対象メモID",
            "content": "追記内容",
            "newContent": "編集後のメモ全文",
            "summary": "メモ要約"
          },
          "answer": "ユーザーへの回答テキスト",
          "mermaid": null,
          "calendarAction": null
        }
      `;

      const text = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(text));
      let finalAnswer = data.answer;

      // ★AIが返したIDを取得し、フォールバックも考慮
      const targetId =
        cleanId(data.data.targetId) || lastReferencedMemoryId.value;

      if (data.action === "MEMORY_EDIT" && targetId && data.data.newContent) {
        try {
          const finalId = cleanId(targetId);
          const docRef = doc(db, "memories", finalId);
          await updateDoc(docRef, { text: data.data.newContent });
          finalAnswer += `\n\n📝 メモを更新しました`;

          // ★短期記憶を更新
          setLastMemoryId(finalId);

          const idx = memories.value.findIndex((m) => m.id === finalId);
          if (idx !== -1) memories.value[idx].text = data.data.newContent;
        } catch {
          finalAnswer += `\n⚠️ 更新失敗`;
        }
      } else if (data.action === "MEMORY_APPEND" && targetId) {
        try {
          const finalId = cleanId(targetId);
          const docRef = doc(db, "memories", finalId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const oldText = docSnap.data().text;
            const newText = `${oldText}\n(追記) ${data.data.content}`;
            await updateDoc(docRef, { text: newText });
            finalAnswer += `\n\n📝 メモに追記しました`;
            // ★短期記憶を更新
            setLastMemoryId(finalId);

            const idx = memories.value.findIndex((m) => m.id === finalId);
            if (idx !== -1) memories.value[idx].text = newText;
          }
        } catch {
          finalAnswer += `\n⚠️ 追記に失敗しました`;
        }
      } else if (data.action === "TASK_DELETE") {
        const deletedTitle = await deleteTodoByTitle(data.data.title);
        finalAnswer += deletedTitle
          ? `\n\n✅ タスク削除: ${deletedTitle}`
          : `\n⚠️ タスクが見つかりませんでした`;
      } else if (data.action === "CALENDAR_DELETE") {
        const deletedTitle = await deleteCalendarEvent(data.data.title);
        finalAnswer += deletedTitle
          ? `\n\n🗑️ 予定削除: ${deletedTitle}`
          : `\n⚠️ 予定が見つかりませんでした`;
      } else if (data.action === "CALENDAR_ADD") {
        try {
          await addEventToGoogleCalendar(
            data.data.title,
            data.data.start,
            data.data.end,
            "9",
          );
          finalAnswer += `\n\n✅ 予定を登録しました: ${data.data.title}`;
        } catch {
          finalAnswer += `\n⚠️ 予定登録に失敗しました`;
        }
      } else if (data.action === "TASK_ADD") {
        await addManualTodo(data.data.title);
        finalAnswer += `\n\n✅ タスクに追加しました: ${data.data.title}`;
      } else if (data.action === "MEMORY_ADD") {
        await addMemory(data.data.content || question, null);
        finalAnswer += `\n\n📝 メモしました`;
      } else if (data.action === "CHAT") {
        // 会話であっても、参照したIDがあれば記憶する
        if (targetId) setLastMemoryId(cleanId(targetId));
      }

      // チャットログ保存
      const logData = {
        userId: currentUser.value!.uid,
        question,
        answer: finalAnswer,
        mermaidCode: data.mermaid || null,
        createdAt: serverTimestamp(),
        displayAnswer: "",
        isAnimating: true,
      };
      const logRef = await addDoc(collection(db, "chat_logs"), logData);
      chatLogs.value.push({
        id: logRef.id,
        ...logData,
        createdAt: new Date(),
        displayAnswer: "",
        isAnimating: true,
      } as any);

      if (voiceMode) speakText(finalAnswer);
      return finalAnswer;
    } catch (e: any) {
      return "エラー: " + e.message;
    } finally {
      isAiThinking.value = false;
    }
  };

  const updateMemory = async (id: string, newText: string) => {
    await updateDoc(doc(db, "memories", id), { text: newText });
    setLastMemoryId(id); // 手動更新時も記憶
    const index = memories.value.findIndex((m) => m.id === id);
    if (index !== -1) {
      memories.value[index].text = newText;
    }
  };
  const deleteMemory = async (id: string) => {
    if (confirm("削除?")) {
      await deleteDoc(doc(db, "memories", id));
      if (lastReferencedMemoryId.value === id) setLastMemoryId(null); // 記憶消去
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

  const startLineAuth = () => {
    const channelId = import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID;
    const redirectUri = window.location.origin + "/app";
    const state = Math.random().toString(36).substring(7);

    if (!channelId) {
      alert("LINEチャネルIDが設定されていません(.envを確認)");
      return;
    }

    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid`;
    window.location.href = url;
  };

  const unlinkLine = async () => {
    if (!confirm("LINE連携を解除しますか？")) return;
    loading.value = true;
    try {
      const functions = getFunctions(getApp(), "asia-northeast1");
      const unlinkFunc = httpsCallable(functions, "unlinkLineAccount");
      await unlinkFunc();

      if (currentUser.value) {
        currentUser.value.isLineLinked = false;
      }
      alert("解除しました");
    } catch (e: any) {
      console.error(e);
      alert("解除に失敗しました");
    } finally {
      loading.value = false;
    }
  };

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
    isCalendarConnected,
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
    addManualTodo,
    callGoogleApi,
    reconnectCalendar,
    startLineAuth,
    unlinkLine,
  };
}
