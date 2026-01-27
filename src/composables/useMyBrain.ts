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

// ---------------- Helper Functions ----------------

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

// ★修正: useNextNs.ts から移植した「動的モデル解決ロジック」
const resolveGeminiModel = async (apiKey: string): Promise<string> => {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await fetch(listUrl);

    if (!listResponse.ok) {
      throw new Error(`Model list fetch failed: ${listResponse.statusText}`);
    }

    const listData = await listResponse.json();

    // generateContentをサポートしているモデルをフィルタリング
    const generationModels = (listData.models || []).filter((m: any) =>
      m.supportedGenerationMethods?.includes("generateContent"),
    );

    // "gemini-1.5-flash" を優先して探す
    const flash = generationModels.find((m: any) =>
      m.name.includes("gemini-1.5-flash"),
    );

    // 見つかればそれ、なければリストの最初を使う
    // "models/" プレフィックスを除去して返す
    const targetModel = (flash || generationModels[0])?.name.replace(
      "models/",
      "",
    );

    if (!targetModel) throw new Error("No available generation models found.");

    return targetModel;
  } catch (e) {
    console.warn(
      "Dynamic model resolution failed, falling back to gemini-1.5-flash",
      e,
    );
    return "gemini-1.5-flash"; // 最悪の場合のフォールバック
  }
};

// ★修正: 動的モデルを使う生成関数
const generateContentWithRetry = async (
  apiKey: string,
  promptParts: any[],
  isJsonMode = false,
) => {
  try {
    // 1. モデル名を動的に決定
    const modelName = await resolveGeminiModel(apiKey);
    console.log("Selected AI Model:", modelName);

    // 2. 生成実行
    const genAI = new GoogleGenerativeAI(apiKey);
    const config = isJsonMode ? { responseMimeType: "application/json" } : {};

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: config,
    });

    const result = await model.generateContent(promptParts);
    return result.response.text();
  } catch (e: any) {
    console.error("AI Generation Error:", e);
    throw new Error("AI processing failed: " + e.message);
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
  const getEmbeddingModel = (apiKey: string) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: "text-embedding-004" });
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
      }
    });
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("google_calendar_token");
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

      const genAI = new GoogleGenerativeAI(apiKey);
      const embedModel = genAI.getGenerativeModel({
        model: "text-embedding-004",
      });

      const result = await embedModel.embedContent(text);
      const vec = result.embedding.values;

      const threshold = 0.55;

      const candidates = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(vec, m.embedding) : 0,
        }))
        .filter((m) => m.score && m.score > threshold)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      if (candidates.length === 0) return [];

      const verifyPrompt = `
        以下の【検索クエリ】に対して、【候補メモ】の中から本当に関連性が高いものだけを選んでください。
        全く関係ない場合は空の配列を返してください。
        【検索クエリ】
        ${text}
        【候補メモ】
        ${candidates.map((c, i) => `${i}: ${c.text}`).join("\n")}
        出力はJSON形式のみ: { "indices": [0, 2] } 
      `;

      const verifyRes = await generateContentWithRetry(
        apiKey,
        [{ text: verifyPrompt }],
        true,
      );
      const verifyJson = JSON.parse(extractJson(verifyRes));
      const validIndices: number[] = verifyJson.indices || [];

      return candidates.filter((_, i) => validIndices.includes(i));
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
        .slice(0, 10)
        .map((m) => `- ${m.text.slice(0, 300)}`)
        .join("\n");
      const calendarEvents = await fetchCalendarEvents();
      const calendarContext = calendarEvents
        ? `\n【直近の予定】\n${calendarEvents}\n`
        : "";
      const nowStr = new Date().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      });

      const prompt = `
        あなたはユーザーの「第2の脳」です。現在日時: ${nowStr}
        ${calendarContext}
        【参照する記憶】
        ${context}
        【質問】
        ${question}
        【指示】
        質問に対する答えだけを生成してください。記憶の羅列は禁止。
        出力JSON: { "answer": "回答テキスト", "mermaid": null, "calendarAction": null }
      `;

      const text = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(text));
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
        } catch {
          finalAnswer += `\n⚠️ エラー: 予定登録失敗`;
        }
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
    const index = memories.value.findIndex((m) => m.id === id);
    if (index !== -1) {
      memories.value[index].text = newText;
    }
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

  // ★追加: LINE連携ロジック
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

  // ★追加: 連携解除ロジック
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
    startLineAuth, // ★公開
    unlinkLine, // ★公開
  };
}
