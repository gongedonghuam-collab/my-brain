import { ref, computed } from "vue";
import { db, auth } from "@/firebase";
// Firebase(データベース)を操作するための便利な道具たちをインポート
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
// 認証機能（ログイン・ログアウト）を使うための道具
import {
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
// AI (Google Gemini) を使うためのSDK
import { GoogleGenerativeAI } from "@google/generative-ai";
// 外部通信（APIコール）を行うためのライブラリ
import axios from "axios";
// 型定義（データの設計図）をインポート
import type { Memory, ChatLog, User, Todo, DailyReport } from "@/types";

// --- 定数定義 ---
// Stripeの決済リンク（課金ページ） - 環境変数から取得
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || "";

// Stripeのカスタマーポータル（解約・カード変更画面）のURL - 環境変数から取得
const STRIPE_PORTAL_LINK = import.meta.env.VITE_STRIPE_PORTAL_LINK || "";

// 管理者権限を持つメールアドレスのリスト
const ADMIN_EMAILS = ["gongedonghuam@gmail.com"];

// AIモデルの候補リスト
const CANDIDATE_MODELS = [
  "gemini-1.5-flash", // 速いモデル (メイン)
  "gemini-1.5-flash-001",
  "gemini-1.5-pro", // 賢いモデル (サブ)
  "gemini-pro",
];

// --- リアクティブな状態変数 (State) ---
// ref() で囲むことで、中身が変わった時に画面も自動で更新されるようになります。

/** 現在ログインしているユーザー情報。未ログイン時は null */
const currentUser = ref<User | null>(null);

/** メモのリスト。Firestoreから取得したデータをここに格納します */
const memories = ref<Memory[]>([]);

/** チャットの履歴リスト */
const chatLogs = ref<ChatLog[]>([]);

/** 未完了のToDoリスト */
const todos = ref<Todo[]>([]);

/** 日報のリスト */
const dailyReports = ref<DailyReport[]>([]);

// --- UIの状態管理フラグ ---
/** ロード中（ぐるぐる）を表示するかどうか */
const loading = ref(false);
/** AIが回答生成中かどうか */
const isAiThinking = ref(false);
/** データの保存処理中かどうか */
const isSaving = ref(false);
/** 音声読み上げ中かどうか */
const isSpeaking = ref(false);
/** 現在選択されているタグフィルタ */
const activeTag = ref<string | null>(null);
/** Googleカレンダーとの連携状態 */
const isCalendarConnected = ref(true);

/**
 * 直前に参照または作成したメモのIDをローカルストレージ（ブラウザの保存領域）に記録します。
 * これにより、リロードしても「さっきのメモ」という文脈を維持できます。
 */
const lastReferencedMemoryId = ref<string | null>(
  localStorage.getItem("last_memory_id"),
);

/**
 * 直前のメモIDを更新する関数
 * @param id メモのID (nullなら削除)
 */
const setLastMemoryId = (id: string | null) => {
  if (id) {
    // IDに含まれる余計な装飾を取り除いて保存
    const clean = id.replace(/<<<|>>>|ID:/gi, "").trim();
    lastReferencedMemoryId.value = clean;
    localStorage.setItem("last_memory_id", clean);
  } else {
    lastReferencedMemoryId.value = null;
    localStorage.removeItem("last_memory_id");
  }
};

// ---------------- Helper Functions (便利ツール関数) ----------------

/**
 * ID文字列から装飾を取り除くクリーニング関数
 * AIが「ID: abc」のように返すことがあるため、純粋なID「abc」にします。
 */
function cleanId(id: string): string {
  if (!id || typeof id !== "string") return "";
  return id.replace(/<<<|>>>|ID:/gi, "").trim();
}

/**
 * AIの返信テキストから、システム用のメッセージ（「📝 メモしました」など）を削除して
 * 純粋な回答だけを取り出す関数
 */
function cleanAiReply(text: string): string {
  return text
    .replace(/📝 メモを更新しました/g, "")
    .replace(/📝 メモに追記しました/g, "")
    .replace(/📝 メモしました/g, "")
    .replace(/✅ .*しました/g, "")
    .replace(/⚠️ .*失敗しました/g, "")
    .trim();
}

/**
 * 日時文字列を強制的にGoogleカレンダーが理解できる形式(ISO 8601)に整形する関数
 * 例: "2024-01-01 10:00" -> "2024-01-01T10:00:00+09:00"
 * @param dateStr 元の日時文字列
 */
function formatIsoDate(dateStr: string): string {
  if (!dateStr) return "";
  // すでにタイムゾーン情報(+09:00など)が含まれていれば何もしない
  if (dateStr.includes("+") || dateStr.endsWith("Z")) return dateStr;

  // 秒がない場合 (YYYY-MM-DDTHH:mm) -> 秒とタイムゾーンを追加
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    return `${dateStr}:00+09:00`;
  }
  // 秒がある場合 (YYYY-MM-DDTHH:mm:ss) -> タイムゾーンを追加
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
    return `${dateStr}+09:00`;
  }
  // 日付のみの場合 (YYYY-MM-DD) -> 00:00:00として扱う
  return `${dateStr}+09:00`; // 簡易的な処理
}

// ★追加: トークンリフレッシュ処理を切り出し
const attemptTokenRefresh = async (): Promise<string | null> => {
  try {
    const functions = getFunctions(getApp(), "asia-northeast1");
    // Cloud Functions の "refreshCalendarToken" を呼び出す
    const refreshFunc = httpsCallable(functions, "refreshCalendarToken");
    const result: any = await refreshFunc(); // 引数なしで呼ぶ

    if (result.data && result.data.accessToken) {
      const newToken = result.data.accessToken;
      // 簡易的に有効期限を設定（ここでは1時間弱とする）
      // 正確にはexpiresInを使うが、まずは動くことを優先
      const newExpiry = new Date().getTime() + 3500 * 1000;

      localStorage.setItem("google_calendar_token", newToken);
      localStorage.setItem(
        "google_calendar_token_expiry",
        newExpiry.toString(),
      );
      console.log("Token refreshed successfully via Cloud Functions.");
      return newToken;
    }
  } catch (e) {
    console.error("Token auto-refresh failed:", e);
  }
  return null;
};

/**
 * Google APIを呼び出すためのラッパー関数（共通処理）
 * ★修正: 401エラー時にCloud Functions経由でリフレッシュを試みる
 * @param callback 実行したいAPI処理
 */
const callGoogleApi = async (callback: (token: string) => Promise<any>) => {
  let token = localStorage.getItem("google_calendar_token");

  // トークンがない場合は即座にリフレッシュを試みる
  if (!token) {
    token = await attemptTokenRefresh();
    if (!token) return null; // リフレッシュ失敗なら終了
  }

  try {
    // トークンがある前提でコールバック実行（型安全のため ! を使用）
    const res = await callback(token!);
    isCalendarConnected.value = true;
    return res;
  } catch (e: any) {
    // 401エラー（トークン切れ）ならリフレッシュして再試行
    if (e.response && e.response.status === 401) {
      console.warn("Calendar token expired (401). Refreshing...");

      const newToken = await attemptTokenRefresh();

      if (newToken) {
        // 新しいトークンでリトライ
        try {
          const retryRes = await callback(newToken);
          isCalendarConnected.value = true;
          return retryRes;
        } catch (retryError) {
          console.error("Retry failed:", retryError);
          return null;
        }
      } else {
        // リフレッシュも失敗したら強制ログアウト
        localStorage.removeItem("google_calendar_token");
        localStorage.removeItem("google_calendar_token_expiry");
        isCalendarConnected.value = false;
        await signOut(auth);
        window.location.href = "/login";
        return null;
      }
    }
    throw e;
  }
};

/**
 * Googleカレンダーとの連携をやり直す（再接続）関数
 * 権限が切れたり、エラーが出た時にユーザーが手動で実行します。
 */
const reconnectCalendar = async () => {
  try {
    const provider = new GoogleAuthProvider();
    // カレンダーへのアクセス権限を追加
    provider.addScope("https://www.googleapis.com/auth/calendar");
    // 毎回アカウント選択画面を出す設定
    provider.setCustomParameters({
      prompt: "select_account consent",
      access_type: "offline",
    });

    const result = await signInWithPopup(auth, provider);
    const tokenResponse = (result as any)._tokenResponse;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    const expiresIn = tokenResponse?.expiresIn || 3600;

    if (token) {
      localStorage.setItem("google_calendar_token", token);

      // 有効期限も更新
      const expiryTime =
        new Date().getTime() + (Number(expiresIn) - 300) * 1000;
      localStorage.setItem(
        "google_calendar_token_expiry",
        expiryTime.toString(),
      );

      isCalendarConnected.value = true;
      alert("カレンダーを再接続しました！");
      window.location.reload();
    }
  } catch (e: any) {
    console.error("Reconnect Error:", e);
    alert("再接続に失敗しました: " + e.message);
  }
};

/**
 * 画像ファイルをAIに送信できる形式（Base64）に変換する関数
 * FileReaderというブラウザの機能を使います。
 */
const fileToGenerativePart = async (file: File) => {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Base64文字列のヘッダー部分（"data:image/png;base64,"など）を取り除く
        const base64String = (reader.result as string).split(",")[1];
        resolve({ inlineData: { data: base64String, mimeType: file.type } });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    },
  );
};

/**
 * コサイン類似度を計算する数学関数
 * 2つのベクトル（数値の配列）がどれくらい似ているかを -1 〜 1 で返します。
 * AI検索（RAG）の核心となる計算です。
 */
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

/**
 * AIの返答からJSON部分だけを抽出する関数
 * AIはMarkdown記法 (```json ... ```) を使うことが多いので、それを取り除きます。
 */
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
// Helper: AI Model Management (AIモデル管理)
// ---------------------------------------------------------

/**
 * 現在使用可能なGeminiモデルのリストを取得する関数
 */
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

/**
 * 最適なAIモデル（Gemini Flash/Pro）を選択する関数
 * Flash（速い）を優先し、なければPro（賢い）を探します。
 */
const resolveGeminiModel = async (apiKey: string): Promise<string> => {
  const models = await fetchAvailableModels(apiKey);
  const generationModels = models.filter((m: any) =>
    m.supportedGenerationMethods?.includes("generateContent"),
  );
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
  return "gemini-1.5-flash"; // デフォルト
};

/**
 * ベクトル化（Embedding）用のモデルを取得する関数
 */
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

/**
 * AIにコンテンツ生成を依頼する関数（リトライ機能付き）
 * メインモデルが失敗したら、自動的にバックアップモデル（Gemini Pro）で再試行します。
 */
const generateContentWithRetry = async (
  apiKey: string,
  promptParts: any[],
  isJsonMode = false,
) => {
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

/**
 * Googleカレンダーから直近の予定を取得する関数
 */
const fetchCalendarEvents = async () => {
  return await callGoogleApi(async (token) => {
    const now = new Date().toISOString();
    // 過去の予定は含めず、未来の予定を10件取得
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

/**
 * Googleカレンダーに新しい予定を追加する関数
 */
const addEventToGoogleCalendar = async (
  title: string,
  startDateTime: string,
  endDateTime: string,
  colorId?: string,
) => {
  // ISO形式 + タイムゾーン (+09:00) にここで強制変換
  const finalStart = formatIsoDate(startDateTime);
  const finalEnd = formatIsoDate(endDateTime);

  await callGoogleApi(async (token) => {
    const event = {
      summary: title,
      start: { dateTime: finalStart },
      end: { dateTime: finalEnd },
      colorId: colorId || "9", // デフォルトはブルーベリー色
    };
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      event,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  });
};

/**
 * Googleカレンダーの予定を検索して削除する関数
 */
const deleteCalendarEvent = async (query: string) => {
  return await callGoogleApi(async (token) => {
    // まず検索してイベントIDを特定
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
    // 特定したIDを使って削除
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return target.summary;
  });
};

/**
 * FirestoreからToDoタスクをタイトル検索して削除する関数
 */
const deleteTodoByTitle = async (title: string) => {
  const todosRef = collection(db, "todos");
  const q = query(
    todosRef,
    where("userId", "==", currentUser.value!.uid),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  // 部分一致で検索（Firestoreは部分一致クエリが苦手なのでJS側でフィルタリング）
  const target = snap.docs.find((d) => d.data().title.includes(title));

  if (target) {
    await deleteDoc(doc(db, "todos", target.id));
    return target.data().title;
  }
  return null;
};

/**
 * ブラウザの音声合成機能を使ってテキストを読み上げる関数
 */
const speakText = (text: string) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // 前の読み上げをキャンセル
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP"; // 日本語設定
  utterance.rate = 1.2; // 少し早口
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

// ---------------- Main Composable (メイン機能の塊) ----------------
// ここから下を Vueコンポーネント（画面）から呼び出して使います。

export function useMyBrain() {
  /**
   * 使用回数制限をチェックし、カウントを増やす関数
   * 無料ユーザーは1日5回まで。Proユーザーは無制限。
   */
  const checkAndIncrementUsage = async (): Promise<boolean> => {
    if (!currentUser.value) return false;
    if (currentUser.value.isPro) return true; // Proなら無制限

    const todayStr = new Date().toISOString().split("T")[0];
    const userRef = doc(db, "users", currentUser.value.uid);
    const snap = await getDoc(userRef);
    const data = snap.data();

    let currentCount = 0;
    // 日付が変わっていたらリセット
    if (data?.lastUsageDate !== todayStr) {
      currentCount = 0;
      await updateDoc(userRef, { dailyUsage: 0, lastUsageDate: todayStr });
    } else {
      currentCount = data?.dailyUsage || 0;
    }

    // 制限チェック
    if (currentCount >= 5) {
      alert("本日の無料枠（5回）を使い切りました。");
      return false;
    }

    // カウントアップ
    await updateDoc(userRef, {
      dailyUsage: increment(1),
      lastUsageDate: todayStr,
    });
    return true;
  };

  /**
   * メモの内容から自動でToDoタスクを抽出して登録する関数
   * AIが「これタスクだね」と判断したものをDBに入れます。
   */
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

      // まとめて書き込み（Batch処理）
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

  /**
   * 手動でToDoを追加する関数
   */
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

  /**
   * 日報（Daily Report）を生成する関数
   * 昨日のメモをAIが集計して要約します。
   */
  const generateDailyReport = async () => {
    if (!currentUser.value) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    // すでに作成済みなら何もしない
    const q = query(
      collection(db, "daily_reports"),
      where("userId", "==", currentUser.value.uid),
      where("date", "==", dateStr),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return;

    // 昨日のメモを取得
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

    // AIで要約
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

  /**
   * Stripeの決済ページへ遷移する関数
   */
  const startSubscription = async () => {
    if (!currentUser.value) return;
    if (confirm("PROプラン（月額980円）の決済画面へ移動しますか？")) {
      if (!STRIPE_PAYMENT_LINK) {
        alert("管理者に連絡してください (決済リンク未設定)");
        return;
      }
      window.location.href = STRIPE_PAYMENT_LINK;
    }
  };

  /**
   * ★追加: サブスクリプション管理（解約）画面へ遷移する関数
   */
  const manageSubscription = async () => {
    if (!currentUser.value) return;

    const isConfirmed = confirm(
      "【PROプランの管理】\n\n解約やクレジットカードの変更は、Stripeの管理画面で行います。\n管理画面へ移動しますか？",
    );

    if (isConfirmed) {
      // URLが未設定の場合は警告を出す
      if (!STRIPE_PORTAL_LINK) {
        alert("管理者に連絡してください。\n(StripeポータルURLが未設定です)");
        return;
      }
      window.location.href = STRIPE_PORTAL_LINK;
    }
  };

  /**
   * Firestoreからメモ一覧を取得する関数
   */
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

  /**
   * チャット履歴を取得する関数
   */
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
      .reverse(); // 古い順に並べ替え
  };

  /**
   * ToDoリストをリアルタイム監視する関数
   * 変更があれば自動で画面が更新されます。
   */
  const fetchTodos = async () => {
    if (!currentUser.value) return;
    const q = query(
      collection(db, "todos"),
      where("userId", "==", currentUser.value.uid),
      orderBy("createdAt", "desc"),
    );
    // onSnapshot: データの変更を監視し続ける
    onSnapshot(q, (snap) => {
      todos.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Todo);
    });
  };

  /**
   * 日報をリアルタイム監視する関数
   */
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

  /**
   * ログイン状態の監視を開始する関数 (アプリ起動時に呼ぶ)
   * ユーザーがログインしているかチェックし、データを読み込みます。
   */
  const initAuth = () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // ログイン中の場合
        currentUser.value = {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || undefined,
          photoURL: user.photoURL || undefined,
          isPro: false,
          dailyUsage: 0,
          isLineLinked: false,
        };
        // ユーザー詳細情報をDBから監視
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          const data = docSnap.data();
          if (data && currentUser.value) {
            const isAdmin = ADMIN_EMAILS.includes(user.email || "");
            // StripeIDがあるか、管理者ならProプラン扱い
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
        // データの初期読み込み
        await Promise.all([
          fetchMemories(),
          fetchChatLogs(),
          fetchTodos(),
          fetchReports(),
        ]);
        generateDailyReport();
      } else {
        // 未ログインの場合、データをクリア
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

  /**
   * ログアウト処理
   */
  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("google_calendar_token");
    localStorage.removeItem("google_calendar_token_expiry");
    localStorage.removeItem("last_memory_id");
    window.location.reload();
  };

  /**
   * タグフィルタを選択する関数
   */
  const selectTag = async (tag: string | null) => {
    activeTag.value = tag;
  };

  /**
   * フィルタリングされたメモ一覧（計算プロパティ）
   */
  const filteredMemories = computed(() => {
    if (!activeTag.value) return memories.value;
    return memories.value.filter((m) => m.tags?.includes(activeTag.value!));
  });

  /**
   * 全タグのリスト（計算プロパティ）
   */
  const allTags = computed(() => {
    const tags = new Set<string>();
    memories.value.forEach((m) => m.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags);
  });

  /**
   * 関連メモを検索する関数 (RAGの中心ロジック)
   * ベクトル検索を使って、意味的に近いメモを探します。
   */
  const findRelatedMemories = async (text: string): Promise<Memory[]> => {
    if (!text.trim() || memories.value.length === 0) return [];
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) return [];

      // 1. 検索クエリをベクトル化
      const embedModel = await getEmbeddingModel(apiKey);
      const result = await embedModel.embedContent(text);
      const vec = result.embedding.values;

      const threshold = 0.55; // 類似度のしきい値

      // 2. 全メモとの類似度を計算し、高い順にソート
      const vecCandidates = memories.value
        .map((m) => ({
          ...m,
          score: m.embedding ? cosineSimilarity(vec, m.embedding) : 0,
        }))
        .filter((m) => m.score && m.score > threshold)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      // 3. 最新のメモも含める（直近の文脈も大事だから）
      const latestMemories = memories.value
        .slice(0, 5)
        .map((m) => ({ ...m, score: 1.0 }));

      // 4. キーワード検索の結果も含める（補完）
      const keywords = text.split(/[\s,、　]+/);
      const keywordCandidates = memories.value
        .filter((m) => keywords.some((k) => k.length > 1 && m.text.includes(k)))
        .slice(0, 3)
        .map((m) => ({ ...m, score: 0.9 }));

      // 5. 重複を削除して候補リストを作成
      const allCandidates = [
        ...latestMemories,
        ...vecCandidates,
        ...keywordCandidates,
      ];
      const uniqueCandidates = Array.from(
        new Map(allCandidates.map((item) => [item.id, item])).values(),
      );

      if (uniqueCandidates.length === 0) return [];

      // 6. 最後にAIに「本当にこれが関連しているか？」を判断させる (Re-ranking)
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

  /**
   * メモを追加する関数
   * 画像がある場合は画像を解析してから保存します。
   */
  const addMemory = async (text: string, files?: File[] | null) => {
    if (!(await checkAndIncrementUsage())) return null;
    isSaving.value = true;
    try {
      const hasImages = files && files.length > 0;
      // まずFirestoreに仮保存
      const docRef = await addDoc(collection(db, "memories"), {
        userId: currentUser.value!.uid,
        text: hasImages ? `(解析中...) ${text}` : text,
        createdAt: serverTimestamp(),
        tags: [],
        aiSummary: "保存中...",
        hasImage: !!hasImages,
        fileType: hasImages ? "image/jpeg" : null,
      });

      // ★ID記憶 (「さっきのメモ」と言われた時に使う)
      setLastMemoryId(docRef.id);

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      let promptParts: any[] = [];
      if (hasImages) {
        // 画像をAIに渡す準備
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

      // AIによる解析・要約
      const resText = await generateContentWithRetry(apiKey, promptParts, true);
      const aiData = JSON.parse(extractJson(resText));

      const finalText = hasImages
        ? `【解析済み】${text}\n\n${aiData.fullText || ""}`
        : text;

      // ベクトル化して保存 (検索のため)
      const embModel = await getEmbeddingModel(apiKey);
      const embResult = await embModel.embedContent(finalText);
      const embedding = embResult.embedding.values;

      // DB更新
      await updateDoc(docRef, {
        text: finalText,
        aiSummary: aiData.summary,
        tags: aiData.tags,
        embedding: embedding,
      });

      // ローカルのリストも更新
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
      // タスクがあれば抽出
      generateTasksFromMemory(docRef.id, finalText);
      return [];
    } catch (e) {
      alert("保存エラー");
      return null;
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * URLからメモを追加する関数 (Cloud Functions経由でスクレイピング)
   */
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

  /**
   * AIと会話するメイン関数
   * ここで「質問」→「記憶検索」→「プロンプト作成」→「AI回答」→「アクション実行」を行います。
   */
  const askBrain = async (
    question: string,
    voiceMode: boolean = false,
  ): Promise<string> => {
    if (!(await checkAndIncrementUsage())) return "";
    isAiThinking.value = true;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("APIキー未設定");

      // 1. 質問をベクトル化
      const embedModel = await getEmbeddingModel(apiKey);
      const qEmbed = await embedModel.embedContent(question);
      const qVec = qEmbed.embedding.values;

      const threshold = 0.55;

      // 2. 類似するメモを検索
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

      // AIに渡すための文脈テキスト作成
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

      // AIへの指令書（プロンプト）
      const prompt = `
        あなたはユーザーの「第2の脳」です。現在日時: ${nowStr}
        ${calendarContext}
        
        【直近の会話履歴】
        ${recentHistory}

        【参照する記憶(ID付き)】
        ${context}
        
        【直前に触ったメモID】: ${lastReferencedMemoryId.value ? `<<<${lastReferencedMemoryId.value}>>>` : "なし"}

        【ユーザー入力】
        ${question}

        【指示】
        ユーザーの意図を汲み取り、適切なアクションを選択してください。
        「これ」「あれ」「さっきの」といった指示語がある場合、「直前に触ったメモID」を優先して対象にしてください。
        
        ★重要:
        - 予定を追加する場合 (CALENDAR_ADD)、日時は必ず **ISO 8601形式 (YYYY-MM-DDTHH:mm:ss+09:00)** で出力してください。
        - ユーザーが「明日10時」と言ったら、現在日時から計算した正確な日時（タイムゾーン+09:00付）を入れてください。
        
        判断基準:
        - 【編集・削除】 "メモの〇〇を消して" "〜に変更して" -> MEMORY_EDIT
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
            "start": "2024-02-01T10:00:00+09:00", 
            "end": "2024-02-01T11:00:00+09:00",
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

      // AIに回答させる
      const text = await generateContentWithRetry(apiKey, [prompt], true);
      const data = JSON.parse(extractJson(text));

      let finalAnswer = cleanAiReply(data.answer);

      const targetId =
        cleanId(data.data.targetId) || lastReferencedMemoryId.value;

      // --- アクションの実行 ---
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
      } else if (data.action === "CHAT" && targetId) {
        setLastMemoryId(cleanId(targetId));
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

  // --- その他のCRUD（作成・読み取り・更新・削除）関数 ---

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
  };

  /**
   * LINEログインを開始する関数
   */
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

  /**
   * LINE連携を解除する関数
   */
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

  // これらの変数や関数を、画面側（.vueファイル）で使えるように公開します
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
