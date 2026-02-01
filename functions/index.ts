import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import axios from "axios";
import * as line from "@line/bot-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// タイムアウト300秒, 東京リージョン
setGlobalOptions({
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 300,
  maxInstances: 10,
});

// Secrets
const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const yahooAppId = defineSecret("YAHOO_APP_ID");

// 予備のモデルリスト (Axios用)
const CANDIDATE_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-001",
  "gemini-1.5-pro",
  "gemini-pro",
];

// --- 通知送信ヘルパー (復元) ---
const sendPushNotification = async (
  uid: string,
  title: string,
  body: string,
) => {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const tokens = userDoc.data()?.fcmTokens || [];
    if (tokens.length > 0) {
      const message = { notification: { title, body }, tokens: tokens };
      await admin.messaging().sendEachForMulticast(message);
    }
    // 通知センターにも履歴を残す
    await db.collection("notifications").add({
      userId: uid,
      type: "info",
      title: title,
      message: body,
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("FCM Error:", e);
  }
};

const sendLineNotification = async (
  uid: string,
  message: string,
  token: string,
  secret: string,
) => {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const lineUserId = userDoc.data()?.lineUserId;
    if (lineUserId) {
      const client = new line.Client({
        channelAccessToken: token,
        channelSecret: secret,
      });
      await client.pushMessage(lineUserId, { type: "text", text: message });
    }
  } catch (e) {
    console.error("LINE Error:", e);
  }
};

// ---------------------------------------------------------
// Helper: AI & Token Logic (新規・修正分)
// ---------------------------------------------------------

function cleanAiReply(text: string): string {
  if (!text) return "";
  return text
    .replace(/📝 メモを更新しました/g, "")
    .replace(/📝 メモに追記しました/g, "")
    .replace(/📝 メモしました/g, "")
    .replace(/✅ .*しました/g, "")
    .replace(/⚠️ .*失敗しました/g, "")
    .replace(/(\n|^)[-・*]\s+.+/g, "")
    .trim();
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch (e2) {
      return { action: "CHAT", reply: text };
    }
  }
}

function cleanId(id: string): string {
  if (!id || typeof id !== "string") return "";
  return id.replace(/<<<|>>>|ID:/gi, "").trim();
}

function formatIsoDate(dateStr: string): string {
  if (!dateStr) return "";
  if (dateStr.includes("+") || dateStr.endsWith("Z")) return dateStr;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
    return `${dateStr}:00+09:00`;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/))
    return `${dateStr}+09:00`;
  return dateStr;
}

// AxiosベースのAI呼び出し (チャット/通知用)
async function fetchAvailableModels(apiKey: string): Promise<any[]> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await axios.get(listUrl);
    return res.data.models || [];
  } catch {
    return [];
  }
}

async function resolveGeminiModel(apiKey: string): Promise<string> {
  const models = await fetchAvailableModels(apiKey);
  const target =
    models.find((m: any) => m.name.includes("gemini-1.5-flash")) ||
    models.find((m: any) => m.name.includes("gemini-1.5-pro"));
  return target ? target.name.replace("models/", "") : "gemini-1.5-flash";
}

async function generateContentWithRetry(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const bestModel = await resolveGeminiModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
  const response = await axios.post(
    url,
    { contents: [{ parts: [{ text: prompt }] }] },
    { headers: { "Content-Type": "application/json" } },
  );
  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGeminiJson(apiKey: string, prompt: string): Promise<any> {
  if (!apiKey) return { action: "CHAT", reply: "API Key Error" };
  try {
    const text = await generateContentWithRetry(apiKey, prompt);
    return extractJson(text);
  } catch (e: any) {
    return { action: "CHAT", reply: `AI Error: ${e.message}` };
  }
}

async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  if (!apiKey) return "";
  try {
    const text = await generateContentWithRetry(apiKey, prompt);
    return text
      .replace(/^```.*\n/gm, "")
      .replace(/```/g, "")
      .trim();
  } catch {
    return "";
  }
}

async function refreshAccessToken(refreshToken: string) {
  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: googleClientId.value(),
      client_secret: googleClientSecret.value(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    return response.data.access_token;
  } catch (e) {
    return null;
  }
}

// ★修正: トークン取得ロジック（Refresh失敗ならDBのAccessを使う）
async function getValidAccessToken(uid: string): Promise<string | null> {
  try {
    const tokenDoc = await db
      .collection("users")
      .doc(uid)
      .collection("system")
      .doc("tokens")
      .get();
    if (!tokenDoc.exists) return null;
    const data = tokenDoc.data();

    // 1. リフレッシュトークンで更新を試みる
    if (data?.refreshToken) {
      const newAccessToken = await refreshAccessToken(data.refreshToken);
      if (newAccessToken) return newAccessToken;
      console.warn("Refresh failed, falling back to stored accessToken");
    }

    // 2. 更新失敗 or なければ、保存されているアクセストークンを使う (1時間以内なら有効)
    if (data?.accessToken) {
      return data.accessToken;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// --- カレンダー操作 ---
async function getCalendarEvents(uid: string): Promise<string> {
  const token = await getValidAccessToken(uid);
  if (!token) return "（連携エラー: 再ログインしてください）";
  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const res = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 20,
        },
      },
    );
    const events = res.data.items || [];
    if (events.length === 0) return "直近の予定なし";
    return events
      .map((ev: any) => {
        const start = ev.start.dateTime
          ? new Date(ev.start.dateTime).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : `[終日] ${ev.start.date}`;
        return `・${start}: ${ev.summary}`;
      })
      .join("\n");
  } catch (e) {
    return "（取得失敗）";
  }
}

async function addCalendarEvent(uid: string, eventData: any): Promise<boolean> {
  const token = await getValidAccessToken(uid);
  if (!token) return false;
  try {
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        summary: eventData.title,
        start: { dateTime: formatIsoDate(eventData.start) },
        end: { dateTime: formatIsoDate(eventData.end) },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteCalendarEvent(
  uid: string,
  query: string,
): Promise<string> {
  const token = await getValidAccessToken(uid);
  if (!token) return "連携エラー: アプリで再ログインしてください。";
  try {
    const search = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query, maxResults: 5, singleEvents: true },
      },
    );
    const events = search.data.items || [];
    if (events.length === 0) return "該当する予定が見つかりませんでした。";
    const target = events[0];
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return `「${target.summary}」を削除しました。`;
  } catch {
    return "削除に失敗しました。";
  }
}

async function deleteTodoByTitle(uid: string, title: string): Promise<string> {
  const todosRef = db.collection("todos");
  const snap = await todosRef
    .where("userId", "==", uid)
    .where("isCompleted", "==", false)
    .limit(30)
    .get();
  const target = snap.docs.find((d) => d.data().title.includes(title));
  if (target) {
    await target.ref.delete();
    return `タスク「${target.data().title}」を削除しました。`;
  }
  return "タスクが見つかりませんでした。";
}

async function getRecentMemories(uid: string, query: string) {
  const snap = await db
    .collection("memories")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  return snap.docs.map((d) => `<<<${d.id}>>> ${d.data().text}`).join("\n");
}
async function getChatHistory(uid: string) {
  const snap = await db
    .collection("chat_logs")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();
  return snap.docs
    .reverse()
    .map((d) => `User: ${d.data().question}\nAI: ${d.data().answer}`)
    .join("\n---\n");
}

// --- ここから機能実装 ---

// 1. LINE連携 (復元)
export const linkLineAccount = onCall(
  {
    secrets: [
      lineLoginChannelId,
      lineLoginChannelSecret,
      lineBotToken,
      lineBotSecret,
    ],
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const { code, redirectUri } = request.data;
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", lineLoginChannelId.value());
      params.append("client_secret", lineLoginChannelSecret.value());
      const tokenRes = await axios.post(
        "https://api.line.me/oauth2/v2.1/token",
        params,
      );
      const profileRes = await axios.get("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
      });
      await db.collection("users").doc(request.auth.uid).set(
        {
          isLineLinked: true,
          lineUserId: profileRes.data.userId,
          lineDisplayName: profileRes.data.displayName,
        },
        { merge: true },
      );
      return { success: true };
    } catch (e: any) {
      throw new HttpsError("internal", e.message);
    }
  },
);

// 1.5 連携解除 (復元)
export const unlinkLineAccount = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  await db
    .collection("users")
    .doc(request.auth.uid)
    .set(
      { isLineLinked: false, lineUserId: admin.firestore.FieldValue.delete() },
      { merge: true },
    );
  return { success: true };
});

// 2. AI (Magic Karte) (復元 - 元のロジック: SDK使用)
export const getAiRecommendation = onCall(
  { secrets: [geminiApiKey] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const apiKey = geminiApiKey.value();
    const { roughNote } = request.data;

    if (!apiKey)
      return {
        rawText: JSON.stringify({
          technical: "APIキーエラー",
          line: "設定を確認してください",
        }),
      };

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      });
      const prompt = `
        美容師のアシスタントAIです。
        以下の【メモ】を元に、JSONデータのみを出力してください。
        挨拶や余計な文章は一切不要です。
        【メモ】${roughNote}
        【出力形式】
        {
            "technical": "美容師向けの専門的なカルテ文章（施術内容、薬剤など）",
            "line": "お客様へ送るサンクスLINEの文章（絵文字を使い、親しみやすく）"
        }`;
      const result = await model.generateContent(prompt);
      let text = result.response.text();
      text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      // JSON抽出
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
      } else {
        return {
          rawText: JSON.stringify({
            technical: text,
            line: "生成内容を確認してください",
          }),
        };
      }
      JSON.parse(text); // Check
      return { rawText: text };
    } catch (e) {
      console.error("AI Error:", e);
      return {
        rawText: JSON.stringify({
          technical: "AI生成に失敗しました",
          line: "手動で入力してください",
        }),
      };
    }
  },
);

// 3. 商品検索 (復元)
export const searchProduct = onCall(
  { secrets: [yahooAppId] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const { code } = request.data;
    const appId = yahooAppId.value();
    if (!code || !appId) return { name: null };
    try {
      const res = await axios.get(
        `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${appId}&jan_code=${code}&results=1`,
      );
      return { name: res.data.hits?.[0]?.name || null };
    } catch (e) {
      return { name: null };
    }
  },
);

// 4. サンクスLINE自動送信 (復元)
export const sendAutoThanksLine = onDocumentCreated(
  { document: "logs/{logId}", secrets: [lineBotToken, lineBotSecret] },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const logData = snapshot.data();
    const stylistId = logData.stylistId || logData.authorId;
    const customerId = logData.customerId;
    const customLineMessage = logData.customLineMessage;

    if (!stylistId || !customerId) return;

    try {
      const settingsRef = db
        .collection("users")
        .doc(stylistId)
        .collection("system")
        .doc("auto_messages");
      const settingsSnap = await settingsRef.get();
      const settings = settingsSnap.exists
        ? settingsSnap.data()
        : { enabled: true };
      if (settings?.enabled === false) return;

      const customerRef = await db.collection("users").doc(customerId).get();
      const lineUserId = customerRef.data()?.lineUserId;
      const customerName = customerRef.data()?.name || "お客様";
      if (!lineUserId) return;

      const template =
        settings?.template ||
        "{name}様\n\n本日はご来店ありがとうございました！";
      const msg =
        customLineMessage || template.replace(/\{name\}/g, customerName);

      await sendLineNotification(
        stylistId,
        msg,
        lineBotToken.value(),
        lineBotSecret.value(),
      ); // 自分へ通知? いや、顧客へ
      // Helperを使わずに直接送信
      const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
      });
      await client.pushMessage(lineUserId, { type: "text", text: msg });
    } catch (e) {
      console.error("[ThanksLine] Error:", e);
    }
  },
);

// 6. 予約作成通知 (復元)
export const notifyOnReservationCreated = onDocumentCreated(
  {
    document: "reservations/{reservationId}",
    secrets: [lineBotToken, lineBotSecret],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const { stylistId, customerId, customerName, date, time, createdBy } = data;
    const token = lineBotToken.value();
    const secret = lineBotSecret.value();
    const msg = `【予約完了】\n${customerName}様\n📅 ${date} ${time}`;

    if (createdBy === customerId) {
      await sendPushNotification(stylistId, "新着予約", msg);
      await sendLineNotification(stylistId, msg, token, secret);
    } else if (createdBy === stylistId) {
      await sendPushNotification(customerId, "予約のお知らせ", msg);
      await sendLineNotification(customerId, msg, token, secret);
    } else {
      await sendPushNotification(stylistId, "新着予約", msg);
      await sendPushNotification(customerId, "予約のお知らせ", msg);
    }
    // Update next reservation
    const conns = await db
      .collection("connections")
      .where("stylistId", "==", stylistId)
      .where("customerId", "==", customerId)
      .get();
    if (!conns.empty) {
      const batch = db.batch();
      conns.docs.forEach((d) => batch.update(d.ref, { nextReservation: date }));
      await batch.commit();
    }
  },
);

// 7. 予約キャンセル通知 (復元)
export const notifyOnReservationDeleted = onDocumentDeleted(
  {
    document: "reservations/{reservationId}",
    secrets: [lineBotToken, lineBotSecret],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const { stylistId, customerId, customerName, date, time } = data;
    const token = lineBotToken.value();
    const secret = lineBotSecret.value();
    const msg = `【予約キャンセル】\n${customerName}様\n📅 ${date} ${time}\n予約が取り消されました。`;
    await sendPushNotification(stylistId, "予約キャンセル", msg);
    await sendLineNotification(stylistId, msg, token, secret);
    await sendPushNotification(customerId, "予約キャンセル", msg);
    await sendLineNotification(customerId, msg, token, secret);
  },
);

// 8. リマインダー通知 (復元)
export const sendDailyReminders = onSchedule(
  "every day 09:00",
  async (event) => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const tomorrowStr = today.toISOString().split("T")[0];
    const snapshot = await db
      .collection("reservations")
      .where("date", "==", tomorrowStr)
      .get();
    if (snapshot.empty) return;
    snapshot.forEach(async (doc) => {
      const data = doc.data();
      const msg = `【リマインダー】\n明日 ${data.time} よりご予約がございます。\nお待ちしております！`;
      await sendPushNotification(data.customerId, "ご予約のリマインダー", msg);
    });
  },
);

// =========================================================
// 5. LINE Webhook (修正版)
// =========================================================
export const lineWebhook = onRequest(
  {
    secrets: [
      lineBotToken,
      lineBotSecret,
      geminiApiKey,
      googleClientId,
      googleClientSecret,
    ],
    cors: true,
  },
  async (req, res) => {
    const token = lineBotToken.value();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;

    await Promise.all(
      events.map(async (event: any) => {
        if (event.type !== "message" || event.message.type !== "text") return;
        const lineUserId = event.source.userId;
        const message = event.message.text.trim();

        // ... Check User ...
        const usersSnap = await db
          .collection("users")
          .where("lineUserId", "==", lineUserId)
          .limit(1)
          .get();
        if (usersSnap.empty) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "アプリで連携してください。",
          });
          return;
        }
        const uid = usersSnap.docs[0].id;
        const userRef = db.collection("users").doc(uid);

        // ... Mode Switch ...
        const commands: Record<string, string> = {
          "【モード】タスク": "TASK",
          "【モード】メモ": "MEMORY",
          "【モード】カレンダー": "CALENDAR",
          "【モード】お任せ": "AUTO",
          "【モード】リセット": "AUTO",
        };
        if (commands[message]) {
          await userRef.update({ lineMode: commands[message] });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: `✅ ${commands[message]}モードになりました。`,
          });
          return;
        }

        const [userDoc, contextSnap] = await Promise.all([
          userRef.get(),
          userRef.collection("system").doc("user_context").get(),
        ]);
        const currentMode = userDoc.data()?.lineMode || "AUTO";
        const lastMemoryId = contextSnap.exists
          ? contextSnap.data()?.lastMemoryId
          : null;

        let activeMemoryContent = "";
        if (lastMemoryId) {
          try {
            const memSnap = await db
              .collection("memories")
              .doc(lastMemoryId)
              .get();
            if (memSnap.exists) {
              activeMemoryContent = `【直前に操作・参照していたメモ】\nID: <<<${lastMemoryId}>>>\n内容: ${memSnap.data()?.text}\n`;
            }
          } catch (e) {
            console.error("Context fetch failed:", e);
          }
        }

        const [memoryContext, chatHistory, calendarEvents] = await Promise.all([
          getRecentMemories(uid, message),
          getChatHistory(uid),
          getCalendarEvents(uid), // Uses improved token logic
        ]);

        const prompt = `
        あなたは優秀な秘書AIです。以下の情報を元にユーザーの要望に応えてください。
        現在日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
        
        【カレンダー】${calendarEvents}
        【記憶】${memoryContext}
        【履歴】${chatHistory}
        
        ユーザー入力: "${message}"
        
        指示:
        JSON形式で出力してください。
        {
          "action": "CALENDAR_ADD" | "CALENDAR_DELETE" | "TASK_ADD" | "TASK_DELETE" | "MEMORY_ADD" | "CHAT",
          "data": { "title": "...", "start": "ISO8601", "end": "ISO8601", "content": "..." },
          "reply": "ユーザーへの返信文（挨拶から始めてください）"
        }
        `;

        const aiRes = await callGeminiJson(apiKey, prompt);
        const action = aiRes.action || "CHAT";
        const data = aiRes.data || {};
        let replyText = aiRes.reply || "処理しました。";

        // Execute Action
        if (action === "CALENDAR_DELETE") {
          const res = await deleteCalendarEvent(uid, data.title || message);
          replyText += `\n${res}`;
          // ★通知蓄積
          await db
            .collection("notifications")
            .add({
              userId: uid,
              type: "cancel",
              title: "予定削除",
              message: res,
              isRead: false,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else if (action === "CALENDAR_ADD") {
          if (await addCalendarEvent(uid, data)) {
            replyText += `\n予定「${data.title}」を追加しました。`;
            // ★通知蓄積
            await db
              .collection("notifications")
              .add({
                userId: uid,
                type: "reservation",
                title: "予定追加",
                message: `「${data.title}」を追加しました`,
                isRead: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
          } else {
            replyText += "\n予定の追加に失敗しました。再ログインしてください。";
          }
        } else if (action === "TASK_ADD") {
          await db.collection("todos").add({
            userId: uid,
            title: data.data.content || message,
            isCompleted: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          replyText += `\n✅ タスク追加: ${data.data.content || message}`;
        } else if (action === "MEMORY_ADD") {
          const docRef = await db.collection("memories").add({
            userId: uid,
            text: data.data.content || message,
            aiSummary: (data.data.content || message).slice(0, 20),
            tags: ["Memo", "LINE"],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          replyText += `\n📝 メモしました`;
          await userRef
            .collection("system")
            .doc("user_context")
            .set({ lastMemoryId: docRef.id }, { merge: true });
        }

        // Save Chat Log
        await db.collection("chat_logs").add({
          userId: uid,
          question: message,
          answer: replyText,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: replyText,
        });
      }),
    );

    res.json({ success: true });
  },
);

// Force Notification (修正版: アクセストークン対応 + 通知蓄積)
export const forceTriggerNotification = onCall(
  {
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
    cors: true,
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const uid = request.auth.uid;
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });

    // 1. Get Token (Try Request param -> DB AccessToken -> DB RefreshToken)
    let token = request.data.accessToken;
    if (!token) token = await getValidAccessToken(uid);

    if (!token)
      return {
        result: "トークンがありません。アプリで再ログインしてください。",
      };

    // 2. Fetch Calendar
    let events = [];
    try {
      const now = new Date();
      const res = await axios.get(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${now.toISOString()}&maxResults=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      events = res.data.items || [];
    } catch (e: any) {
      return { result: "カレンダー取得失敗: " + e.message };
    }

    const title = events.length > 0 ? events[0].summary : "(直近の予定なし)";

    // 3. AI Gen (★修正: SDK使用)
    const cheatSheetPrompt = `「${title}」のカンペを作成して。関連メモ: (省略) ※関連情報がなくても、適当に励ましの言葉を入れて必ず何か出力すること。
    ★重要: 出力は「お疲れ様です」や「こんにちは」から始まる、ユーザーへのメッセージ本文のみを出力してください。`;

    const cheatSheet = await callGeminiText(
      geminiApiKey.value(),
      cheatSheetPrompt,
    );

    // 4. Send & Log
    const userDoc = await db.collection("users").doc(uid).get();
    await client.pushMessage(userDoc.data()?.lineUserId, {
      type: "text",
      text: `🎥 ${title}\n\n${cheatSheet}`,
    });

    // ★通知蓄積
    await db.collection("notifications").add({
      userId: uid,
      type: "info",
      title: "テスト通知",
      message: `「${title}」の通知を送りました`,
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { result: "送信成功" };
  },
);

export const scrapeUrl = onCall(async () => {
  return { success: true };
});
