// ==============================================================================
//  My Brain (AI秘書) バックエンドプログラム 【日本時間・重複返信修正版】
//  - 修正: スケジュール実行を日本時間 (Asia/Tokyo) に設定
//  - 修正: 返信を「カードのみ」にして二重送信を防止
//  - その他: AIロジック維持、JSDoc維持
// ==============================================================================

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
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

setGlobalOptions({
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 300,
});

// --- Secrets (環境変数) ---
const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");
const openWeatherApiKey = defineSecret("OPENWEATHER_API_KEY");

// --- 定数: テーマカラー ---
const COLORS = {
  primary: "#6366f1",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#0ea5e9",
  dark: "#1e293b",
  text: "#334155",
  textLight: "#94a3b8",
};

/**
 * OpenWeatherMapの天気種別を絵文字に変換します。
 * @param weatherMain - 天気のメイン種別 (例: "Clear", "Rain")
 * @returns 天気に対応する絵文字
 */
function getWeatherEmoji(weatherMain: string): string {
  switch (weatherMain) {
    case "Clear":
      return "☀️";
    case "Clouds":
      return "☁️";
    case "Rain":
      return "☔";
    case "Snow":
      return "⛄";
    case "Thunderstorm":
      return "⚡";
    case "Drizzle":
      return "💧";
    case "Mist":
    case "Smoke":
    case "Haze":
    case "Dust":
    case "Fog":
      return "🌫️";
    default:
      return "🌡️";
  }
}

// ==============================================================================
//  Flex Message 作成関数群 (LINEの見やすいカードを作る関数)
// ==============================================================================

/**
 * Googleカレンダー連携切れの警告カードを作成します。
 */
function createReauthFlex(): line.FlexBubble {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.danger,
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: "⚠️ 連携切れ",
          color: "#ffffff",
          weight: "bold",
          size: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: "Googleカレンダーへのアクセス権限が切れました。",
          wrap: true,
          size: "sm",
          color: COLORS.text,
          margin: "md",
        },
        {
          type: "text",
          text: "以下のボタンから再接続してください。",
          wrap: true,
          size: "xs",
          color: COLORS.textLight,
          margin: "sm",
        },
        {
          type: "button",
          action: {
            type: "uri",
            label: "🔄 今すぐ再接続する",
            uri: "https://my-brain-145b1.web.app/app?reconnect=true",
          },
          style: "primary",
          color: COLORS.primary,
          margin: "lg",
        },
      ],
    },
  };
}

/**
 * 予定のリマインダー通知用カードを作成します。
 */
function createReminderFlex(
  title: string,
  start: string,
  end: string,
  location?: string,
  weatherInfo?: string,
  weatherIcon: string = "🌤️",
): line.FlexBubble {
  const startDate = new Date(start);
  const timeStr = `${startDate.getHours()}:${startDate.getMinutes().toString().padStart(2, "0")}`;

  const bodyContents: line.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "⏰", size: "xl", flex: 0, margin: "sm" },
        {
          type: "text",
          text: "まもなく開始",
          weight: "bold",
          size: "md",
          color: COLORS.text,
          margin: "md",
          gravity: "center",
        },
      ],
    },
    { type: "separator", margin: "lg", color: "#f1f5f9" },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        {
          type: "text",
          text: timeStr + " ~",
          size: "3xl",
          weight: "bold",
          color: COLORS.primary,
          margin: "md",
        },
        {
          type: "text",
          text: title,
          size: "lg",
          weight: "bold",
          color: COLORS.text,
          wrap: true,
          margin: "sm",
        },
        location
          ? {
              type: "box",
              layout: "horizontal",
              margin: "sm",
              contents: [
                { type: "text", text: "📍", size: "xs", flex: 0 },
                {
                  type: "text",
                  text: location,
                  size: "xs",
                  color: COLORS.textLight,
                  margin: "sm",
                  wrap: true,
                },
              ],
            }
          : { type: "spacer", size: "xs" },
      ],
    },
  ];

  if (weatherInfo) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      contents: [
        { type: "separator", margin: "lg", color: "#f1f5f9" },
        {
          type: "box",
          layout: "horizontal",
          margin: "lg",
          contents: [
            { type: "text", text: weatherIcon, size: "sm" },
            {
              type: "text",
              text: "WEATHER INFO",
              size: "xxs",
              weight: "bold",
              color: COLORS.info,
              margin: "sm",
              offsetTop: "1px",
            },
          ],
        },
        {
          type: "text",
          text: weatherInfo,
          size: "xs",
          color: COLORS.text,
          margin: "sm",
          wrap: true,
        },
      ],
    });
  }

  const footerContents: line.FlexComponent[] = [];
  if (location && location.trim() !== "") {
    footerContents.push({
      type: "button",
      style: "primary",
      height: "sm",
      color: COLORS.info,
      // Google Maps Correct URL
      action: {
        type: "uri",
        label: "📍 ルートを調べる",
        uri: `http://googleusercontent.com/maps.google.com/maps?q=${encodeURIComponent(location)}`,
      },
    });
  }

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      paddingAll: "20px",
      backgroundColor: "#ffffff",
      cornerRadius: "xl",
      borderColor: COLORS.primary,
      borderWidth: "normal",
    },
    footer:
      footerContents.length > 0
        ? {
            type: "box",
            layout: "vertical",
            contents: footerContents,
            paddingAll: "20px",
          }
        : undefined,
  };
}

/**
 * AIとのチャット返答用カードを作成します。
 */
function createChatFlex(text: string): line.FlexBubble {
  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          margin: "none",
          contents: [
            {
              type: "text",
              text: "🧠 My Brain",
              weight: "bold",
              size: "xxs",
              color: COLORS.primary,
              flex: 1,
            },
            {
              type: "text",
              text: "AI Answer",
              weight: "bold",
              size: "xxs",
              color: "#cbd5e1",
              align: "end",
            },
          ],
        },
        { type: "separator", margin: "sm", color: "#f1f5f9" },
        {
          type: "text",
          text: text,
          size: "sm",
          color: COLORS.text,
          wrap: true,
          margin: "md",
          lineSpacing: "5px",
        },
      ],
      backgroundColor: "#ffffff",
      cornerRadius: "xl",
      borderColor: "#e2e8f0",
      borderWidth: "light",
    },
  };
}

/**
 * 予定追加完了時のカードを作成します。
 */
function createCalendarFlex(
  title: string,
  start: string,
  end: string,
  location?: string,
  weatherInfo?: string,
  weatherIcon: string = "🌤️",
): line.FlexBubble {
  const startDate = new Date(start);
  const dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
  const timeStr = `${startDate.getHours()}:${startDate.getMinutes().toString().padStart(2, "0")}`;
  const weekDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    startDate.getDay()
  ];

  const bodyContents: line.FlexComponent[] = [
    {
      type: "box",
      layout: "horizontal",
      alignItems: "flex-end",
      contents: [
        {
          type: "text",
          text: dateStr,
          size: "3xl",
          weight: "bold",
          color: COLORS.text,
          flex: 0,
        },
        {
          type: "text",
          text: weekDay,
          size: "md",
          color: COLORS.danger,
          weight: "bold",
          margin: "sm",
          offsetBottom: "5px",
        },
      ],
    },
    {
      type: "text",
      text: timeStr + " ~",
      size: "xl",
      weight: "bold",
      color: COLORS.primary,
      margin: "sm",
    },
    { type: "separator", margin: "lg", color: "#f1f5f9" },
    {
      type: "box",
      layout: "vertical",
      margin: "lg",
      contents: [
        {
          type: "text",
          text: title,
          size: "lg",
          weight: "bold",
          color: COLORS.text,
          wrap: true,
        },
        location
          ? {
              type: "box",
              layout: "horizontal",
              margin: "sm",
              contents: [
                { type: "text", text: "📍", size: "xs", flex: 0 },
                {
                  type: "text",
                  text: location,
                  size: "xs",
                  color: COLORS.textLight,
                  margin: "sm",
                },
              ],
            }
          : { type: "spacer", size: "xs" },
      ],
    },
  ];

  if (weatherInfo) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      contents: [
        { type: "separator", margin: "lg", color: "#f1f5f9" },
        {
          type: "box",
          layout: "horizontal",
          margin: "lg",
          contents: [
            { type: "text", text: weatherIcon, size: "sm" },
            {
              type: "text",
              text: "WEATHER INFO",
              size: "xxs",
              weight: "bold",
              color: COLORS.info,
              margin: "sm",
              offsetTop: "1px",
            },
          ],
        },
        {
          type: "text",
          text: weatherInfo,
          size: "xs",
          color: COLORS.text,
          margin: "sm",
          wrap: true,
        },
      ],
    });
  }

  const footerContents: line.FlexComponent[] = [];
  if (location && location.trim() !== "") {
    footerContents.push({
      type: "button",
      style: "primary",
      color: COLORS.info,
      height: "sm",
      margin: "sm",
      action: {
        type: "uri",
        label: "📍 ルートを調べる",
        uri: `http://googleusercontent.com/maps.google.com/maps?q=${encodeURIComponent(location)}`,
      },
    });
  }
  footerContents.push({
    type: "button",
    style: "secondary",
    height: "sm",
    margin: "sm",
    action: {
      type: "uri",
      label: "Googleカレンダーを開く",
      uri: "https://calendar.google.com/",
    },
  });

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.primary,
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: "SCHEDULED",
          color: "#ffffff",
          weight: "bold",
          size: "xxs",
        },
        {
          type: "text",
          text: "予定を登録しました",
          color: "#ffffff",
          weight: "bold",
          size: "sm",
          margin: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      paddingAll: "20px",
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: footerContents,
      paddingAll: "20px",
      spacing: "md",
    },
  };
}

function createTaskFlex(title: string): line.FlexBubble {
  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "horizontal",
      paddingAll: "20px",
      backgroundColor: "#f0fdf4",
      contents: [
        {
          type: "box",
          layout: "vertical",
          contents: [{ type: "text", text: "✅", size: "xxl" }],
          width: "40px",
          justifyContent: "center",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "TASK ADDED",
              size: "xxs",
              weight: "bold",
              color: COLORS.success,
            },
            {
              type: "text",
              text: title,
              size: "md",
              weight: "bold",
              color: COLORS.text,
              wrap: true,
              margin: "xs",
            },
          ],
        },
      ],
    },
  };
}

function createMemoryFlex(text: string, isUpdate = false): line.FlexBubble {
  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      backgroundColor: "#fffbeb",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: isUpdate ? "📝 MEMO UPDATED" : "🧠 MEMORY SAVED",
              weight: "bold",
              size: "xxs",
              color: COLORS.warning,
            },
            {
              type: "text",
              text: "My Brain",
              weight: "bold",
              size: "xxs",
              color: "#cbd5e1",
              align: "end",
            },
          ],
        },
        {
          type: "text",
          text: text,
          size: "sm",
          color: COLORS.text,
          wrap: true,
          maxLines: 5,
          margin: "md",
          lineSpacing: "4px",
        },
      ],
    },
  };
}

function createRoutineSuggestionFlex(patterns: string): line.FlexBubble {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.info,
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: "✨", size: "sm" },
            {
              type: "text",
              text: "ROUTINE FOUND",
              color: "#ffffff",
              weight: "bold",
              size: "xxs",
              margin: "sm",
            },
          ],
        },
        {
          type: "text",
          text: "定例タスクの提案",
          color: "#ffffff",
          weight: "bold",
          size: "md",
          margin: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: "あなたの行動パターンから、以下のルーティンを見つけました。",
          color: COLORS.text,
          size: "xs",
          wrap: true,
        },
        { type: "separator", margin: "md", color: "#f1f5f9" },
        {
          type: "text",
          text: patterns,
          color: COLORS.dark,
          size: "sm",
          wrap: true,
          margin: "md",
          weight: "bold",
          lineSpacing: "4px",
        },
      ],
    },
  };
}

// --- ヘルパー関数 ---

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      let cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return { action: "CHAT", reply: text };
    } catch (e2) {
      return { action: "CHAT", reply: text };
    }
  }
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

// --- AI Model Management (Dynamic + Fail-safe) ---

// ログ出力付きでモデル一覧を取得
async function fetchAvailableModels(apiKey: string): Promise<any[]> {
  try {
    console.log("【Debug】Fetching models list from API...");
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    // 取得したモデル名をログに出力
    console.log(
      "【Debug】Fetched Models from API:",
      (res.data.models || []).map((m: any) => m.name),
    );
    return res.status === 200 ? res.data.models || [] : [];
  } catch (e: any) {
    console.error("【Error】Failed to fetch models:", e.message);
    return [];
  }
}

// リストにあるモデルを優先順位に従って探し、なければ「リストにある最初の一件」を使う
async function resolveGeminiModel(apiKey: string): Promise<string> {
  const models = await fetchAvailableModels(apiKey);
  const genModels = models.filter((m: any) =>
    m.supportedGenerationMethods?.includes("generateContent"),
  );

  // 1.5-flash-001 (具体的なバージョン) を最優先
  let target = genModels.find((m: any) =>
    m.name.includes("gemini-1.5-flash-001"),
  );
  // 次に 1.5-flash 系
  if (!target)
    target = genModels.find((m: any) => m.name.includes("gemini-1.5-flash"));
  // 次に 1.5-pro 系
  if (!target)
    target = genModels.find((m: any) => m.name.includes("gemini-1.5-pro"));
  // それでもなければリストの先頭
  if (!target && genModels.length > 0) target = genModels[0];

  // ★ログ出力: 最終的に選ばれたモデル
  console.log("【Debug】Selected Model (Raw):", target ? target.name : "None");

  // ★重要: フロントエンドに合わせて "models/" を削除して返す
  // リスト取得失敗時は "gemini-1.5-flash-001" (models/無し) をデフォルトにする
  const finalName = target
    ? target.name.replace("models/", "")
    : "gemini-1.5-flash-001";
  console.log("【Debug】Final Model Name for SDK:", finalName);

  return finalName;
}

async function generateContentWithRetry(
  apiKey: string,
  promptParts: any[],
  isJsonMode = false,
) {
  try {
    const modelName = await resolveGeminiModel(apiKey);
    console.log("【Debug】Generating content with:", modelName);

    const genAI = new GoogleGenerativeAI(apiKey);
    const config = isJsonMode ? { responseMimeType: "application/json" } : {};

    // SDKには "models/" 無しの名前を渡す
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: config,
    });

    const result = await model.generateContent(promptParts);
    return result.response.text();
  } catch (e: any) {
    console.error("【Error】AI Generation Error (Primary):", e);
    // フォールバック
    try {
      console.log("【Debug】Retrying with fallback: gemini-1.5-flash-001");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-001", // 具体名で指定 (models/無し)
        generationConfig: isJsonMode
          ? { responseMimeType: "application/json" }
          : {},
      });
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
    const text = await generateContentWithRetry(
      apiKey,
      [{ text: prompt }],
      true,
    );
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

// --- Calendar Logic ---
async function refreshAccessToken(refreshToken: string) {
  try {
    console.log("Refreshing access token...");
    const res = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: googleClientId.value(),
      client_secret: googleClientSecret.value(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    if (!res.data || !res.data.access_token) {
      console.error("Google OAuth response missing access_token:", res.data);
      return null;
    }
    return res.data;
  } catch (e: any) {
    console.error(
      "Token Refresh Failed:",
      e.response ? e.response.data : e.message,
    );
    return null;
  }
}

async function getValidAccessToken(uid: string): Promise<string | null> {
  const docRef = db
    .collection("users")
    .doc(uid)
    .collection("system")
    .doc("tokens");
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(`User ${uid}: Token document not found.`);
    return null;
  }
  const data = snap.data();
  if (!data?.refreshToken) {
    console.error(`User ${uid}: No refresh token available.`);
    return null;
  }

  if (data.accessToken) {
    try {
      await axios.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        {
          headers: { Authorization: `Bearer ${data.accessToken}` },
          params: { maxResults: 1 },
        },
      );
      return data.accessToken;
    } catch (e: any) {
      if (e.response?.status !== 401) return data.accessToken;
    }
  }
  const newTokens = await refreshAccessToken(data.refreshToken);
  if (newTokens?.access_token) {
    await docRef.set(
      {
        accessToken: newTokens.access_token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return newTokens.access_token;
  }
  return null;
}

async function getCalendarEvents(uid: string): Promise<string> {
  try {
    const token = await getValidAccessToken(uid);
    if (!token) return "（未連携）";
    const now = new Date().toISOString();
    try {
      const res = await axios.get(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            timeMin: now,
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
          },
        },
      );
      return (res.data.items || [])
        .map((e: any) => `${e.start.dateTime || e.start.date}: ${e.summary}`)
        .join("\n");
    } catch {
      return "（取得失敗）";
    }
  } catch {
    return "（エラー）";
  }
}
async function addCalendarEvent(
  uid: string,
  eventData: { title: string; start: string; end?: string; location?: string },
): Promise<boolean> {
  try {
    const token = await getValidAccessToken(uid);
    if (!token) return false;
    const finalStart = formatIsoDate(eventData.start);
    if (!finalStart) return false;
    const finalEnd = eventData.end
      ? formatIsoDate(eventData.end)
      : new Date(new Date(finalStart).getTime() + 60 * 60000)
          .toISOString()
          .replace("Z", "+09:00");
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        summary: eventData.title || "無題の予定",
        location: eventData.location || "",
        start: { dateTime: finalStart },
        end: { dateTime: finalEnd },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return true;
  } catch {
    return false;
  }
}

async function checkWeather(
  location: string,
  dateStr: string,
): Promise<{ info: string; icon: string } | null> {
  const apiKey = openWeatherApiKey.value();
  if (!apiKey) return null;
  try {
    const query = location || "Tokyo";
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric&lang=ja`;
    const res = await axios.get(url);
    const forecasts = res.data.list || [];
    const targetTime = new Date(dateStr).getTime();
    const closest = forecasts.reduce((prev: any, curr: any) => {
      return Math.abs(curr.dt * 1000 - targetTime) <
        Math.abs(prev.dt * 1000 - targetTime)
        ? curr
        : prev;
    });
    if (!closest) return null;

    const weatherMain = closest.weather[0]?.main || "Clear";
    const description = closest.weather[0]?.description || "晴れ";
    const pop = Math.round(closest.pop * 100);
    const icon = getWeatherEmoji(weatherMain);

    return {
      info: `予報は「${description}」(降水確率${pop}%) です。`,
      icon: icon,
    };
  } catch {
    return null;
  }
}

async function deleteCalendarEvent(
  uid: string,
  query: string,
): Promise<string | null> {
  try {
    const token = await getValidAccessToken(uid);
    if (!token) return null;
    const searchRes = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: query, maxResults: 5, singleEvents: true },
      },
    );
    const events = searchRes.data.items || [];
    if (events.length === 0) return null;
    const target = events[0];
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return target.summary;
  } catch {
    return null;
  }
}
async function deleteTodoByTitle(
  uid: string,
  title: string,
): Promise<string | null> {
  try {
    const ref = db.collection("todos");
    const snap = await ref
      .where("userId", "==", uid)
      .where("isCompleted", "==", false)
      .get();
    const target = snap.docs.find((d) => {
      const dbTitle = d.data().title;
      return dbTitle.includes(title) || title.includes(dbTitle);
    });
    if (target) {
      await target.ref.delete();
      return target.data().title;
    }
    return null;
  } catch {
    return null;
  }
}
async function deleteMemoryByContent(
  uid: string,
  content: string,
): Promise<string | null> {
  try {
    const ref = db.collection("memories");
    const snap = await ref.where("userId", "==", uid).limit(50).get();
    const target = snap.docs.find((d) => {
      const dbText = d.data().text;
      return dbText.includes(content) || content.includes(dbText);
    });
    if (target) {
      await target.ref.delete();
      return target.data().text.substring(0, 20) + "...";
    }
    return null;
  } catch {
    return null;
  }
}
async function getRecentMemories(uid: string, query: string): Promise<string> {
  try {
    const snap = await db
      .collection("memories")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    if (snap.empty) return "（履歴なし）";
    return snap.docs
      .map((d) => `<<<${d.id}>>> ${d.data().text.replace(/\n/g, " ")}`)
      .join("\n");
  } catch {
    return "（メモ取得失敗）";
  }
}
async function getOpenTodos(uid: string): Promise<string> {
  try {
    const snap = await db
      .collection("todos")
      .where("userId", "==", uid)
      .where("isCompleted", "==", false)
      .limit(20)
      .get();
    if (snap.empty) return "（未完了タスクなし）";
    return snap.docs.map((d) => `・${d.data().title}`).join("\n");
  } catch {
    return "（タスク取得失敗）";
  }
}
async function getChatHistory(uid: string): Promise<string> {
  try {
    const snap = await db
      .collection("chat_logs")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    return snap.docs
      .reverse()
      .map((d) => `User: ${d.data().question}\nAI: ${d.data().answer}`)
      .join("\n---\n");
  } catch {
    return "";
  }
}

// ==============================================================================
//  ★API: LINE連携処理
// ==============================================================================
export const linkLineAccount = onCall(
  { secrets: [lineLoginChannelId, lineLoginChannelSecret], cors: true },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const { code, redirectUri } = request.data;
    const clientId = lineLoginChannelId.value();
    const clientSecret = lineLoginChannelSecret.value();
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      const tokenRes = await axios.post(
        "https://api.line.me/oauth2/v2.1/token",
        params,
      );
      const { access_token } = tokenRes.data;
      const profileRes = await axios.get("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const { userId, displayName } = profileRes.data;
      await db.collection("users").doc(request.auth.uid).set(
        {
          isLineLinked: true,
          lineUserId: userId,
          lineDisplayName: displayName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { success: true };
    } catch (e: any) {
      throw new HttpsError("internal", e.message);
    }
  },
);

// ==============================================================================
//  API: トークンリフレッシュ
// ==============================================================================
export const refreshCalendarToken = onCall(
  { secrets: [googleClientId, googleClientSecret], cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Login required");
    const docRef = db
      .collection("users")
      .doc(req.auth.uid)
      .collection("system")
      .doc("tokens");
    const snap = await docRef.get();
    const rt = snap.data()?.refreshToken;
    if (!rt) throw new HttpsError("not-found", "No refresh token");
    const newTokens = await refreshAccessToken(rt);
    if (!newTokens?.access_token) throw new HttpsError("internal", "Failed");
    await docRef.set(
      {
        accessToken: newTokens.access_token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      accessToken: newTokens.access_token,
      expiresIn: newTokens.expires_in,
    };
  },
);

// --- 5. メイン処理: LINE Webhook (修正済み) ---
export const lineWebhook = onRequest(
  {
    secrets: [
      lineBotToken,
      geminiApiKey,
      googleClientId,
      googleClientSecret,
      openWeatherApiKey,
    ],
    cors: true,
  },
  async (req, res) => {
    const token = lineBotToken.value();
    const apiKey = geminiApiKey.value();
    if (!token || !apiKey) {
      res.status(500).send("Config Error");
      return;
    }
    const client = new line.Client({ channelAccessToken: token });

    try {
      await Promise.all(
        req.body.events.map(async (event: any) => {
          if (event.type === "follow") {
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "友だち登録ありがとうございます！🎉\n\nこのアカウントはあなたの「第2の脳」です。\nアプリと連携して、AI秘書機能を活用してください✨\n\n👇 アプリ画面に戻って連携を完了させてね！",
            });
            return;
          }
          if (event.type !== "message" || event.message.type !== "text") return;
          const lineUserId = event.source.userId;
          const messageId = event.message.id;

          // ★重複チェック
          const existingLog = await db
            .collection("chat_logs")
            .where("lineMessageId", "==", messageId)
            .limit(1)
            .get();
          if (!existingLog.empty) {
            console.log(`Duplicate message ${messageId} ignored.`);
            return;
          }

          // ★ローディング表示 (Loading Animation)
          try {
            await axios.post(
              "https://api.line.me/v2/bot/chat/loading/start",
              { chatId: lineUserId, loadingSeconds: 20 }, // 最大20秒表示
              { headers: { Authorization: `Bearer ${token}` } },
            );
          } catch (loadingError) {
            console.error("Loading animation error:", loadingError);
          }

          const message = event.message.text.trim();
          const usersSnap = await db
            .collection("users")
            .where("lineUserId", "==", lineUserId)
            .limit(1)
            .get();
          if (usersSnap.empty) {
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "アプリと連携してください",
            });
            return;
          }
          const uid = usersSnap.docs[0].id;
          const userRef = db.collection("users").doc(uid);

          const commands: any = {
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

          const [context, memory, chat, cal, todo] = await Promise.all([
            userRef.collection("system").doc("user_context").get(),
            getRecentMemories(uid, message),
            getChatHistory(uid),
            getCalendarEvents(uid),
            getOpenTodos(uid),
          ]);
          const nowStr = new Date().toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          });
          const routerPrompt = `あなたはユーザーの「専属パートナーAI」です。現在日時: ${nowStr}\n【会話履歴】${chat}\n【カレンダー】${cal}\n【未完了タスク】${todo}\n【最近のメモ】${memory}\n【入力】"${message}"\n【指示】ユーザーの意図を汲み取りJSONで出力。\n返信フォーマット厳守: \n- 親しみやすい口調\n- 改行・箇条書き・絵文字(😊,📅等)を使用\n- 重要な情報は【 】等で強調\n出力JSON: { "action": "CALENDAR_ADD"|"CALENDAR_DELETE"|"TASK_ADD"|"TASK_DELETE"|"MEMORY_ADD"|"MEMORY_EDIT"|"MEMORY_APPEND"|"CHAT", "data": { "title", "start", "end", "location": "場所名(なければnull)", "isOutdoor": boolean(天気が影響する予定か), "content", "targetId", "instruction" }, "reply": "整形済み返信テキスト" }`;

          const aiRes = await callGeminiJson(apiKey, routerPrompt);
          const action = aiRes.action || "CHAT";
          const data = aiRes.data || {};
          let replyText = aiRes.reply || "処理しました。";
          let flex: any = null;
          let newMemId = null;

          if (action === "CALENDAR_ADD") {
            const success = await addCalendarEvent(uid, {
              title: data.title,
              start: data.start,
              end: data.end,
              location: data.location,
            });
            if (success) {
              const shouldCheckWeather = data.location || data.isOutdoor;
              const weatherData = shouldCheckWeather
                ? await checkWeather(data.location, data.start)
                : null;

              flex = createCalendarFlex(
                data.title,
                data.start,
                data.end,
                data.location,
                weatherData?.info,
                weatherData?.icon,
              );
              if (weatherData)
                replyText += `\n(${weatherData.icon} ${weatherData.info})`;

              await db.collection("notifications").add({
                userId: uid,
                type: "reservation",
                title: "予定追加",
                message: `「${data.title}」登録`,
                isRead: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              flex = createReauthFlex();
              replyText = ""; // 修正: Flexがある場合は空文字でもOK (後で処理)
            }
          } else if (action === "CALENDAR_DELETE") {
            const del = await deleteCalendarEvent(uid, data.title || message);
            if (del) {
              replyText = `🗑️ 予定「${del}」を削除しました`;
              await db.collection("notifications").add({
                userId: uid,
                type: "cancel",
                title: "予定削除",
                message: `「${del}」を削除しました`,
                isRead: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              flex = createReauthFlex();
              replyText = "";
            }
          } else if (action === "TASK_ADD") {
            await db.collection("todos").add({
              userId: uid,
              title: data.title || message,
              isCompleted: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            flex = createTaskFlex(data.title || message);
            await db.collection("notifications").add({
              userId: uid,
              type: "info",
              title: "タスク追加",
              message: `「${data.title || message}」を追加しました`,
              isRead: false,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else if (action === "TASK_DELETE") {
            const del = await deleteTodoByTitle(uid, data.title || message);
            replyText = del
              ? `✅ タスク「${del}」完了`
              : "タスクが見つかりません";
            if (del) {
              await db.collection("notifications").add({
                userId: uid,
                type: "info",
                title: "タスク完了",
                message: `「${del}」を完了しました`,
                isRead: false,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          } else if (action === "MEMORY_ADD") {
            const ref = await db.collection("memories").add({
              userId: uid,
              text: data.content || message,
              aiSummary: (data.content || message).slice(0, 20),
              tags: ["LINE"],
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            flex = createMemoryFlex(data.content || message);
            newMemId = ref.id;
            await db.collection("notifications").add({
              userId: uid,
              type: "info",
              title: "メモ保存",
              message: "新しい記憶を保存しました",
              isRead: false,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else if (action === "MEMORY_EDIT" && data.targetId) {
            const docId = data.targetId.replace(/\[ID:|\]|<<|>>/g, "").trim();
            await db
              .collection("memories")
              .doc(docId)
              .update({ text: data.content });
            flex = createMemoryFlex(data.content, true);
            await db.collection("notifications").add({
              userId: uid,
              type: "info",
              title: "メモ更新",
              message: "更新しました",
              isRead: false,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else if (action === "MEMORY_APPEND" && data.targetId) {
            const docId = data.targetId.replace(/\[ID:|\]|<<|>>/g, "").trim();
            const snap = await db.collection("memories").doc(docId).get();
            const newText =
              (snap.data()?.text || "") + "\n(追記) " + data.content;
            await db
              .collection("memories")
              .doc(docId)
              .update({ text: newText });
            flex = createMemoryFlex(newText, true);
            await db.collection("notifications").add({
              userId: uid,
              type: "info",
              title: "メモ追記",
              message: "追記しました",
              isRead: false,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          if (newMemId)
            await userRef
              .collection("system")
              .doc("user_context")
              .set({ lastMemoryId: newMemId }, { merge: true });

          await db.collection("chat_logs").add({
            userId: uid,
            lineMessageId: messageId,
            question: message,
            answer: replyText || "（再接続が必要です）",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // ★修正: メッセージ構築ロジック（空文字エラー回避 & カード統一）
          const messages: line.Message[] = [];

          if (flex) {
            // カードがある場合はカードのみ送る（重複防止）
            // altTextに返信テキストを設定しておくと通知で内容がチラ見せできて便利です
            messages.push({
              type: "flex",
              altText: replyText || "詳細情報",
              contents: flex,
            });
          } else {
            // カードがない場合（通常の会話など）も、見やすいカード形式(ChatFlex)に統一
            // ※ただし replyText が空なら何もしない（空送信エラー回避）
            if (replyText && replyText.trim() !== "") {
              messages.push({
                type: "flex",
                altText: replyText,
                contents: createChatFlex(replyText),
              });
            }
          }

          // メッセージが1つでもある場合のみ送信する
          if (messages.length > 0) {
            await client.replyMessage(event.replyToken, messages);
          } else {
            // 万が一メッセージが空になってしまった場合の保険（通常ここには来ない）
            console.warn("Empty message avoided.");
          }
        }),
      );
    } catch (e) {
      console.error(e);
    }
    res.json({ success: true });
  },
);

export const checkUpcomingMeetings = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: [
      lineBotToken,
      googleClientId,
      googleClientSecret,
      openWeatherApiKey,
    ],
  },
  async (event) => {
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });
    const users = await db
      .collection("users")
      .where("isLineLinked", "==", true)
      .get();

    for (const doc of users.docs) {
      const uid = doc.id;
      const lineUserId = doc.data().lineUserId;
      const token = await getValidAccessToken(uid);
      if (!token) continue;

      const now = new Date();
      const min = new Date(now.getTime() + 15 * 60000).toISOString();
      const max = new Date(now.getTime() + 30 * 60000).toISOString();

      try {
        const res = await axios.get(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              timeMin: min,
              timeMax: max,
              singleEvents: true,
              orderBy: "startTime",
            },
          },
        );

        for (const ev of res.data.items || []) {
          const w = ev.location
            ? await checkWeather(ev.location, ev.start.dateTime)
            : undefined;
          await client.pushMessage(doc.data().lineUserId, {
            type: "flex",
            altText: "予定リマインダー",
            contents: createReminderFlex(
              ev.summary,
              ev.start.dateTime,
              ev.end.dateTime,
              ev.location,
              w?.info,
              w?.icon,
            ),
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  },
);

export const sendMorningBriefing = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo", // ★修正: 日本時間を指定
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
  },
  async () => {
    const users = await db
      .collection("users")
      .where("isLineLinked", "==", true)
      .get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });
    for (const doc of users.docs) {
      const uid = doc.id;
      const [cal, todos] = await Promise.all([
        getCalendarEvents(uid),
        getOpenTodos(uid),
      ]);
      const prompt = `今日は${new Date().toLocaleDateString()}です。予定:${cal}、タスク:${todos}。元気が出る朝のブリーフィングを作成して。`;
      const text = await callGeminiText(apiKey!, prompt);

      // ★修正: ここもカード形式(ChatFlex)に統一
      await client.pushMessage(doc.data().lineUserId, {
        type: "flex",
        altText: "☀️ おはようございます！",
        contents: createChatFlex(`☀️ おはようございます！\n\n${text}`),
      });
    }
  },
);

// --- 週次ルーティン提案 (日曜20時) ---
// ★修正: ここも日本時間を指定
export const checkRoutinePatterns = onSchedule(
  {
    schedule: "0 20 * * 0",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
  },
  async (event) => {
    const usersSnap = await db
      .collection("users")
      .where("isLineLinked", "==", true)
      .get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const lineUserId = userDoc.data().lineUserId;

      // 直近のメモを取得
      const memories = await getRecentMemories(uid, "");
      if (!memories || memories === "（履歴なし）") continue;

      // Geminiに分析させる
      const prompt = `以下のユーザーのメモ履歴から、来週の「やるべきこと（ルーティン）」を提案してください。\nメモ:\n${memories}\n\n出力は、提案するタスクのリスト（箇条書き）のみ。挨拶不要。`;
      const suggestion = await callGeminiText(apiKey!, prompt);

      if (suggestion) {
        await client.pushMessage(lineUserId, {
          type: "flex",
          altText: "📅 来週のタスク提案",
          contents: createRoutineSuggestionFlex(suggestion),
        });
      }
    }
  },
);
