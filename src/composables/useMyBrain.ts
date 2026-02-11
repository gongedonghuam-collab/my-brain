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

const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || "";
const STRIPE_PORTAL_LINK = import.meta.env.VITE_STRIPE_PORTAL_LINK || "";
const ADMIN_EMAILS = ["gongedonghuam@gmail.com", "taku.03302003@gmail.com"];

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

const isCalendarConnected = ref(false);

const lastReferencedMemoryId = ref<string | null>(
  localStorage.getItem("last_memory_id"),
);

const setLastMemoryId = (id: string | null) => {
  if (id) {
    const clean = id.replace(/<<<|>>>|ID:/gi, "").trim();
    lastReferencedMemoryId.value = clean;
    localStorage.setItem("last_memory_id", clean);
  } else {
    lastReferencedMemoryId.value = null;
    localStorage.removeItem("last_memory_id");
  }
};

// --- Helpers ---
function cleanId(id: string): string {
  if (!id || typeof id !== "string") return "";
  return id.replace(/<<<|>>>|ID:/gi, "").trim();
}
function cleanAiReply(text: string): string {
  return text
    .replace(/📝 メモを更新しました/g, "")
    .replace(/📝 メモに追記しました/g, "")
    .replace(/📝 メモしました/g, "")
    .replace(/✅ .*しました/g, "")
    .replace(/⚠️ .*失敗しました/g, "")
    .trim();
}
function formatIsoDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("+") || dateStr.endsWith("Z")) return dateStr;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
    return `${dateStr}:00+09:00`;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/))
    return `${dateStr}+09:00`;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return `${dateStr}T00:00:00+09:00`;
  return dateStr;
}

// --- トークン自動更新ロジック ---
const attemptTokenRefresh = async (): Promise<string | null> => {
  try {
    const functions = getFunctions(getApp(), "asia-northeast1");
    const refreshFunc = httpsCallable(functions, "refreshCalendarToken");
    const result: any = await refreshFunc();

    if (result.data && result.data.accessToken) {
      const newToken = result.data.accessToken;
      const expiresIn = result.data.expiresIn || 3600;
      const newExpiry = new Date().getTime() + (Number(expiresIn) - 300) * 1000;

      localStorage.setItem("google_calendar_token", newToken);
      localStorage.setItem(
        "google_calendar_token_expiry",
        newExpiry.toString(),
      );
      console.log("Token refreshed successfully.");

      isCalendarConnected.value = true;
      return newToken;
    }
  } catch (e) {
    console.error("Token sync failed:", e);
  }
  return null;
};

// --- APIラッパー ---
const callGoogleApi = async (callback: (token: string) => Promise<any>) => {
  let token = localStorage.getItem("google_calendar_token");

  if (!token) {
    token = await attemptTokenRefresh();
    if (!token) {
      isCalendarConnected.value = false;
      return null;
    }
  }

  try {
    const res = await callback(token!);
    isCalendarConnected.value = true;
    return res;
  } catch (e: any) {
    if (e.response && e.response.status === 401) {
      console.warn("401 Unauthorized. Retrying refresh...");
      const newToken = await attemptTokenRefresh();

      if (newToken) {
        try {
          const retryRes = await callback(newToken);
          isCalendarConnected.value = true;
          return retryRes;
        } catch (retryError) {
          console.error("Retry failed:", retryError);
          return null;
        }
      } else {
        localStorage.removeItem("google_calendar_token");
        localStorage.removeItem("google_calendar_token_expiry");
        isCalendarConnected.value = false;
        return null;
      }
    }
    throw e;
  }
};

// --- カレンダー再接続 ---
const reconnectCalendar = async (isAuto: boolean = false) => {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar");

    provider.setCustomParameters({
      prompt: "select_account consent",
      access_type: "offline",
    });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const tokenResponse = (result as any)._tokenResponse;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    const refreshToken =
      tokenResponse?.oauthRefreshToken || tokenResponse?.refreshToken;

    if (!refreshToken) {
      alert(
        "⚠️ 再接続に失敗しました（リフレッシュトークン未発行）。\nGoogleアカウントの連携設定を一度解除してから再試行してください。",
      );
      return;
    }

    const expiresIn = tokenResponse?.expiresIn || 3600;

    if (token && user) {
      localStorage.setItem("google_calendar_token", token);
      const expiryTime =
        new Date().getTime() + (Number(expiresIn) - 300) * 1000;
      localStorage.setItem(
        "google_calendar_token_expiry",
        expiryTime.toString(),
      );

      const tokenData: any = {
        accessToken: token,
        refreshToken: refreshToken,
        updatedAt: serverTimestamp(),
      };
      const tokenRef = doc(db, "users", user.uid, "system", "tokens");
      await setDoc(tokenRef, tokenData);

      // ★重要: フロントエンドでフラグを更新
      await updateDoc(doc(db, "users", user.uid), { isGoogleLinked: true });
      isCalendarConnected.value = true;

      if (isAuto) {
        alert("✅ 再接続しました！\nLINEに戻ります。");
        window.location.href = "line://";
      } else {
        alert("✅ カレンダーを再接続しました！");
        window.location.reload();
      }
    }
  } catch (e: any) {
    console.error("Reconnect Error:", e);
    alert("再接続エラー: " + e.message);
  }
};

// ... (省略なしでその他の関数を記述)
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

// ... AI Model Management ...
async function fetchAvailableModels(apiKey: string): Promise<any[]> {
  try {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    return res.status === 200 ? res.data.models || [] : [];
  } catch {
    return [];
  }
}
async function resolveGeminiModel(apiKey: string): Promise<string> {
  const models = await fetchAvailableModels(apiKey);
  const genModels = models.filter((m: any) =>
    m.supportedGenerationMethods?.includes("generateContent"),
  );
  let target = genModels.find((m: any) => m.name.includes("gemini-1.5-flash"));
  if (!target)
    target = genModels.find((m: any) => m.name.includes("gemini-1.5-pro"));
  if (!target && genModels.length > 0) target = genModels[0];
  return target ? target.name.replace("models/", "") : "gemini-1.5-flash";
}
async function getEmbeddingModel(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const models = await fetchAvailableModels(apiKey);
    const embeddingModels = models.filter((m: any) =>
      m.supportedGenerationMethods?.includes("embedContent"),
    );
    let target = embeddingModels.find((m: any) =>
      m.name.includes("text-embedding-004"),
    );
    if (!target)
      target = embeddingModels.find((m: any) =>
        m.name.includes("embedding-001"),
      );
    if (!target && embeddingModels.length > 0) target = embeddingModels[0];
    const modelName = target
      ? target.name.replace("models/", "")
      : "embedding-001";
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    return genAI.getGenerativeModel({ model: "embedding-001" });
  }
}
async function generateContentWithRetry(
  apiKey: string,
  promptParts: any[],
  isJsonMode = false,
) {
  try {
    const modelName = await resolveGeminiModel(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    const config = isJsonMode ? { responseMimeType: "application/json" } : {};
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: config,
    });
    const result = await model.generateContent(promptParts);
    return result.response.text();
  } catch (e: any) {
    console.error("AI Generation Error (Primary):", e);
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContent(promptParts);
      return result.response.text();
    } catch (retryError: any) {
      throw new Error("AI processing failed completely: " + retryError.message);
    }
  }
}
async function callGeminiJson(apiKey: string, prompt: string): Promise<any> {
  if (!apiKey) return { action: "CHAT", reply: "⚠️ APIキー未設定" };
  try {
    const text = await generateContentWithRetry(apiKey, [{ text: prompt }]);
    return extractJson(text);
  } catch (e: any) {
    return { action: "CHAT", reply: `💦 AIエラー: ${e.message}` };
  }
}
async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) return "";
  try {
    const text = await generateContentWithRetry(apiKey, [{ text: prompt }]);
    return text
      .replace(/^```.*\n/gm, "")
      .replace(/```/g, "")
      .trim();
  } catch {
    return "";
  }
}

// ... Calendar/Todo API ...
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
  const finalStart = formatIsoDate(startDateTime);
  const finalEnd = formatIsoDate(endDateTime);
  await callGoogleApi(async (token) => {
    const event = {
      summary: title,
      start: { dateTime: finalStart },
      end: { dateTime: finalEnd },
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

// --- Main Composable ---
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
      const prompt = `以下のメモから「やるべきこと（ToDo）」を抽出しJSONで返して。{ "tasks": ["タスク1", "タスク2"] } メモ: ${text}`;
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
      await addDoc(collection(db, "notifications"), {
        userId: currentUser.value.uid,
        type: "info",
        title: "タスク追加",
        message: `「${title}」を追加しました`,
        isRead: false,
        timestamp: serverTimestamp(),
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
      if (!STRIPE_PAYMENT_LINK) {
        alert("管理者に連絡してください");
        return;
      }
      window.location.href = STRIPE_PAYMENT_LINK;
    }
  };

  const manageSubscription = async () => {
    if (!currentUser.value) return;
    const isConfirmed = confirm(
      "【PROプランの管理】\n\n解約やクレジットカードの変更は、Stripeの管理画面で行います。\n管理画面へ移動しますか？",
    );
    if (isConfirmed) {
      if (!STRIPE_PORTAL_LINK) {
        alert("管理者に連絡してください。");
        return;
      }
      window.location.href = STRIPE_PORTAL_LINK;
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
          isGoogleLinked: false,
        };

        await attemptTokenRefresh();

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
              isGoogleLinked: data.isGoogleLinked || false,
              defaultLocation: data.defaultLocation || undefined,
            };

            // ★重要: Firestoreで連携済みなら、ローカルの接続フラグも強制的にTrueにする
            if (data.isGoogleLinked) {
              isCalendarConnected.value = true;
            }
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
        localStorage.removeItem("last_memory_id");
        lastReferencedMemoryId.value = null;
      }
    });
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("google_calendar_token");
    localStorage.removeItem("google_calendar_token_expiry");
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
      const verifyPrompt = `以下の【検索クエリ】に対して、【候補メモ】の中から本当に関連性が高いものだけを選んでください。\n【検索クエリ】${text}\n【候補メモ】\n${uniqueCandidates.map((c, i) => `${i} (ID:${c.id}): ${c.text}`).join("\n")}\n出力はJSON形式のみ: { "indices": [0, 2] }`;
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
      await addDoc(collection(db, "notifications"), {
        userId: currentUser.value!.uid,
        type: "info",
        title: "メモ保存",
        message: "新しい記憶を保存しました",
        isRead: false,
        timestamp: serverTimestamp(),
      });
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
      const prompt = `あなたはユーザーの「第2の脳」です。現在日時: ${nowStr}\n${calendarContext}\n【直近の会話履歴】\n${recentHistory}\n【参照する記憶(ID付き)】\n${context}\n【直前に触ったメモID】: ${lastReferencedMemoryId.value ? `<<<${lastReferencedMemoryId.value}>>>` : "なし"}\n【ユーザー入力】\n${question}\n【指示】ユーザーの意図を汲み取り、適切なアクションを選択してください。\n★重要: 予定を追加する場合 (CALENDAR_ADD)、日時は必ず **ISO 8601形式 (YYYY-MM-DDTHH:mm:ss+09:00)** で出力してください。\n出力はJSON形式のみ:\n{ "action": "CALENDAR_ADD" | "CALENDAR_DELETE" | "TASK_ADD" | "TASK_DELETE" | "MEMORY_APPEND" | "MEMORY_EDIT" | "MEMORY_ADD" | "CHAT", "data": { "title": "予定/タスク名", "start": "2024-02-01T10:00:00+09:00", "end": "2024-02-01T11:00:00+09:00", "targetId": "対象メモID", "content": "追記内容", "newContent": "編集後のメモ全文", "summary": "メモ要約" }, "answer": "ユーザーへの回答テキスト", "mermaid": null }`;
      const text = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(text));
      let finalAnswer = cleanAiReply(data.answer);
      const targetId =
        cleanId(data.data.targetId) || lastReferencedMemoryId.value;
      if (data.action === "MEMORY_EDIT" && targetId && data.data.newContent) {
        try {
          const finalId = cleanId(targetId);
          const docRef = doc(db, "memories", finalId);
          await updateDoc(docRef, { text: data.data.newContent });
          finalAnswer += `\n\n📝 メモを更新しました`;
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
        if (deletedTitle) {
          await addDoc(collection(db, "notifications"), {
            userId: currentUser.value!.uid,
            type: "info",
            title: "タスク削除",
            message: `「${deletedTitle}」を削除しました`,
            isRead: false,
            timestamp: serverTimestamp(),
          });
        }
      } else if (data.action === "CALENDAR_DELETE") {
        const deletedTitle = await deleteCalendarEvent(data.data.title);
        finalAnswer += deletedTitle
          ? `\n\n🗑️ 予定削除: ${deletedTitle}`
          : `\n⚠️ 予定が見つかりませんでした`;
        if (deletedTitle) {
          await addDoc(collection(db, "notifications"), {
            userId: currentUser.value!.uid,
            type: "cancel",
            title: "予定削除",
            message: `「${deletedTitle}」を削除しました`,
            isRead: false,
            timestamp: serverTimestamp(),
          });
        }
      } else if (data.action === "CALENDAR_ADD") {
        try {
          await addEventToGoogleCalendar(
            data.data.title,
            data.data.start,
            data.data.end,
            "9",
          );
          finalAnswer += `\n\n✅ 予定を登録しました: ${data.data.title}`;
          try {
            await addDoc(collection(db, "notifications"), {
              userId: currentUser.value!.uid,
              type: "reservation",
              title: "予定追加",
              message: `「${data.data.title}」を登録しました`,
              isRead: false,
              timestamp: serverTimestamp(),
            });
          } catch (notificationError) {
            console.warn(
              "通知の保存に失敗しました（予定は登録済み）",
              notificationError,
            );
          }
        } catch (calendarError: any) {
          console.error("Calendar Add Error:", calendarError);
          finalAnswer += `\n⚠️ 予定登録に失敗しました: ${calendarError.message}`;
        }
      } else if (data.action === "TASK_ADD") {
        await addManualTodo(data.data.title);
        finalAnswer += `\n\n✅ タスクに追加しました: ${data.data.title}`;
      } else if (data.action === "MEMORY_ADD") {
        await addMemory(data.data.content || question, null);
        finalAnswer += `\n\n📝 メモしました`;
      } else if (data.action === "CHAT" && targetId) {
        setLastMemoryId(cleanId(targetId));
      }
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
    setLastMemoryId(id);
    const index = memories.value.findIndex((m) => m.id === id);
    if (index !== -1) {
      memories.value[index].text = newText;
    }
  };
  const deleteMemory = async (id: string) => {
    if (confirm("削除?")) {
      await deleteDoc(doc(db, "memories", id));
      if (lastReferencedMemoryId.value === id) setLastMemoryId(null);
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
    await addDoc(collection(db, "notifications"), {
      userId: currentUser.value!.uid,
      type: "info",
      title: "タスク削除",
      message: "タスクを削除しました",
      isRead: false,
      timestamp: serverTimestamp(),
    });
  };
  const startLineAuth = () => {
    const channelId = import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID;
    const redirectUri = window.location.origin + "/app";
    const state = Math.random().toString(36).substring(7);
    if (!channelId) {
      alert("LINEチャネルIDが設定されていません(.envを確認)");
      return;
    }
    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid&bot_prompt=aggressive`;
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
    manageSubscription,
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
