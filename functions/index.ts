import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import axios from "axios";
import * as line from "@line/bot-sdk";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// メモリ設定
setGlobalOptions({
  region: "asia-northeast1",
  memory: "1GiB",
  timeoutSeconds: 60,
});

// Secrets
const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");

// フォールバック用のモデルリスト
const CANDIDATE_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-001",
  "gemini-1.5-flash-002",
  "gemini-1.5-pro",
  "gemini-1.5-pro-001",
  "gemini-pro",
];

// ---------------------------------------------------------
// Helper: 動的にGeminiモデルを解決
// ---------------------------------------------------------
async function resolveGeminiModel(apiKey: string): Promise<string> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await axios.get(listUrl);

    if (listResponse.status !== 200) {
      throw new Error(`Model list fetch failed: ${listResponse.statusText}`);
    }

    const listData = listResponse.data;
    const generationModels = (listData.models || []).filter((m: any) =>
      m.supportedGenerationMethods?.includes("generateContent"),
    );
    const flash = generationModels.find((m: any) =>
      m.name.includes("gemini-1.5-flash"),
    );
    const targetModel = (flash || generationModels[0])?.name.replace(
      "models/",
      "",
    );

    if (!targetModel) throw new Error("No available generation models found.");
    return targetModel;
  } catch (e) {
    console.warn(
      "Dynamic model resolution failed, falling back to candidate list logic",
      e,
    );
    return "";
  }
}

// ---------------------------------------------------------
// Helper: Gemini API (JSONモード & リトライ)
// ---------------------------------------------------------
async function callGeminiJson(apiKey: string, prompt: string): Promise<any> {
  const dynamicModel = await resolveGeminiModel(apiKey);
  let modelsToTry = dynamicModel
    ? [dynamicModel, ...CANDIDATE_MODELS]
    : CANDIDATE_MODELS;
  modelsToTry = [...new Set(modelsToTry)];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        },
        { headers: { "Content-Type": "application/json" } },
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          try {
            const cleaned = text.replace(/```json|```/g, "").trim();
            return JSON.parse(cleaned);
          } catch (e2) {
            return { type: "CHAT", reply: text.substring(0, 100) };
          }
        }
      }
    } catch (e) {
      console.warn(`Model ${modelName} failed, retrying...`);
    }
  }
  throw new Error("All AI models failed");
}

// ---------------------------------------------------------
// Helper: Gemini API (Textモード)
// ---------------------------------------------------------
async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  const dynamicModel = await resolveGeminiModel(apiKey);
  let modelsToTry = dynamicModel
    ? [dynamicModel, ...CANDIDATE_MODELS]
    : CANDIDATE_MODELS;
  modelsToTry = [...new Set(modelsToTry)];

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await axios.post(
        url,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" } },
      );
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) {}
  }
  return "すみません、今ちょっとAIの調子が悪いです。";
}

// ---------------------------------------------------------
// Helper: Google Token Refresh
// ---------------------------------------------------------
async function refreshAccessToken(refreshToken: string) {
  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: googleClientId.value(),
      client_secret: googleClientSecret.value(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    return response.data.access_token;
  } catch (e: any) {
    console.error("Token Refresh Error:", e.message);
    return null;
  }
}

// ---------------------------------------------------------
// Helper: カレンダー取得
// ---------------------------------------------------------
async function getCalendarEvents(uid: string): Promise<string> {
  try {
    const tokenDoc = await db
      .collection("users")
      .doc(uid)
      .collection("system")
      .doc("tokens")
      .get();

    if (!tokenDoc.exists) return "（カレンダー未連携）";

    const refreshToken = tokenDoc.data()?.refreshToken;
    if (!refreshToken) return "（カレンダー権限なし）";

    const accessToken = await refreshAccessToken(refreshToken);
    if (!accessToken) return "（トークン期限切れ）";

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const calendarRes = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 15,
        },
      },
    );

    const events = calendarRes.data.items || [];
    if (events.length === 0) return "直近1週間の予定はありません。";

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
    console.error("Calendar Fetch Error:", e);
    return "（カレンダー取得エラー）";
  }
}

// ---------------------------------------------------------
// Helper: 過去のメモ取得
// ---------------------------------------------------------
async function getRecentMemories(uid: string): Promise<string> {
  try {
    const snapshot = await db
      .collection("memories")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    if (snapshot.empty) return "（過去のメモなし）";

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const date = data.createdAt?.toDate
          ? `[${data.createdAt.toDate().toLocaleDateString()}]`
          : "";
        return `${date} ${data.text}`;
      })
      .join("\n");
  } catch (e) {
    console.error("Memory Fetch Error", e);
    return "（メモ取得エラー）";
  }
}

// =========================================================
// 機能 1: LINE Webhook (リッチメニュー対応版 - 修正済み)
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

    if (!token || !apiKey) {
      res.status(500).send("Config Error");
      return;
    }

    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;

    await Promise.all(
      events.map(async (event: any) => {
        if (event.type !== "message" || event.message.type !== "text") return;

        const eventId = event.webhookEventId;
        const lineUserId = event.source.userId;
        const message = event.message.text.trim(); // 空白削除

        // 重複排除
        const eventRef = db.collection("processed_events").doc(eventId);
        try {
          await eventRef.create({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: lineUserId,
          });
        } catch (e) {
          return; // 重複につき終了
        }

        // ユーザー特定
        const usersSnap = await db
          .collection("users")
          .where("lineUserId", "==", lineUserId)
          .limit(1)
          .get();
        if (usersSnap.empty) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "アプリで「LINE連携」ボタンを押してね🙇‍♂️",
          });
          return;
        }
        const uid = usersSnap.docs[0].id;

        // ★★★ 修正ポイント: モード切替判定を最優先で行う ★★★
        // AI処理や他の判定に入る前に、この文字列が来たら即座にモードを変えてリターンする
        if (message === "【モード】タスク") {
          await db.collection("users").doc(uid).update({ lineMode: "TASK" });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ タスクモードになりました。\n入力した内容はすべてToDoリストに追加されます。",
          });
          return;
        }
        if (message === "【モード】メモ") {
          await db.collection("users").doc(uid).update({ lineMode: "MEMORY" });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "📝 メモモードになりました。\n入力した内容はすべてメモとして保存されます。",
          });
          return;
        }
        if (message === "【モード】カレンダー") {
          await db
            .collection("users")
            .doc(uid)
            .update({ lineMode: "CALENDAR" });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "📅 カレンダーモードになりました。\n「明日」「来週」などと入力すると予定を答えます。",
          });
          return;
        }
        if (
          message === "【モード】お任せ" ||
          message === "【モード】リセット"
        ) {
          await db.collection("users").doc(uid).update({ lineMode: "AUTO" });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "🤖 お任せモードになりました。\nAIが内容を判断します。",
          });
          return;
        }

        // --- 以下、通常のメッセージ処理 ---

        // 1. 現在のモードを取得
        const userDoc = await db.collection("users").doc(uid).get();
        const currentMode = userDoc.data()?.lineMode || "AUTO";

        let msgType = "CHAT";

        // モードによる強制判定
        if (currentMode === "TASK") {
          msgType = "FORCE_TASK";
        } else if (currentMode === "MEMORY") {
          msgType = "FORCE_MEMORY";
        } else if (currentMode === "CALENDAR") {
          msgType = "CALENDAR";
        } else {
          // ★ AUTOモード: 従来のAI仕分け
          const classifyPrompt = `
            ユーザーの入力を分類してJSONで出力せよ:
            入力: "${message}"
            分類基準:
            - CALENDAR: 予定を聞く質問
            - MEMORY: 記録・保存の指示
            - CHAT: その他、質問、雑談
            出力: { "type": "CALENDAR" | "MEMORY" | "CHAT" }
          `;
          try {
            const result = await callGeminiJson(apiKey, classifyPrompt);
            if (result && result.type) msgType = result.type;
          } catch (e) {}
        }

        // ★ 3. モードごとの処理実行
        if (msgType === "FORCE_TASK") {
          // 強制タスク保存
          // 要約とタグ生成だけAIにやらせる（処理はタスク固定）
          const tagResult = await callGeminiJson(
            apiKey,
            `テキスト: "${message}"\nJSON出力: { "summary": "20文字要約", "tags": [] }`,
          );

          await db.collection("memories").add({
            userId: uid,
            text: message,
            aiSummary: tagResult.summary || message.slice(0, 20),
            tags: [...(tagResult.tags || []), "LINE", "Task"],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          await db.collection("todos").add({
            userId: uid,
            title: message,
            isCompleted: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ タスクに追加しました",
          });
        } else if (msgType === "FORCE_MEMORY") {
          // 強制メモ保存
          const tagResult = await callGeminiJson(
            apiKey,
            `テキスト: "${message}"\nJSON出力: { "summary": "20文字要約", "tags": [] }`,
          );

          await db.collection("memories").add({
            userId: uid,
            text: message,
            aiSummary: tagResult.summary || message.slice(0, 20),
            tags: [...(tagResult.tags || []), "LINE", "Memo"],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "📝 メモしました",
          });
        } else if (msgType === "CALENDAR") {
          // カレンダー参照
          const eventsText = await getCalendarEvents(uid);
          const reply = await callGeminiText(
            apiKey,
            `質問: "${message}"\n予定:\n${eventsText}\nこれを見て答えて。`,
          );
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: reply,
          });
        } else if (msgType === "MEMORY") {
          // AUTOモード時のメモ判定（AIに詳細を任せる）
          const memoryPrompt = `
            入力: "${message}"
            これを保存します。JSON出力: { "summary": "20文字要約", "tags": [], "isTask": boolean }
            isTask判定: "ToDo"や"〜しなきゃ"や"買う"等のアクションはtrue。単なる記録や予定宣言はfalse。
          `;
          const memResult = await callGeminiJson(apiKey, memoryPrompt);

          await db.collection("memories").add({
            userId: uid,
            text: message,
            aiSummary: memResult.summary,
            tags: [...(memResult.tags || []), "LINE"],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });

          if (memResult.isTask) {
            await db.collection("todos").add({
              userId: uid,
              title: message,
              isCompleted: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              source: "LINE",
            });
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "📝 タスクに追加しました",
            });
          } else {
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "📓 メモしました",
            });
          }
        } else {
          // CHATモード (AUTO) - 記憶参照付き
          const memoryContext = await getRecentMemories(uid);
          const chatPrompt = `
            ユーザー: ${message}
            【直近の記憶】${memoryContext}
            指示: 記憶に答えがあればそれを使って親切に返信して。なければ「記録にありません」と答えて。
          `;
          const reply = await callGeminiText(apiKey, chatPrompt);
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: reply,
          });
        }
      }),
    );

    res.json({ success: true });
  },
);

// =========================================================
// 機能 2: LINE連携設定
// =========================================================
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
    const clientId = lineLoginChannelId.value();
    const clientSecret = lineLoginChannelSecret.value();

    if (!clientId || !clientSecret) {
      throw new HttpsError("failed-precondition", "LINE secrets not set");
    }

    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);

      const tokenResponse = await axios.post(
        "https://api.line.me/oauth2/v2.1/token",
        params,
      );
      const { access_token } = tokenResponse.data;

      const profileResponse = await axios.get(
        "https://api.line.me/v2/profile",
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      const lineUserId = profileResponse.data.userId;
      const lineDisplayName = profileResponse.data.displayName;

      await db.collection("users").doc(request.auth.uid).set(
        {
          isLineLinked: true,
          lineUserId: lineUserId,
          lineDisplayName: lineDisplayName,
        },
        { merge: true },
      );

      return { success: true };
    } catch (error: any) {
      console.error("LINE Link Error:", error.response?.data || error.message);
      throw new HttpsError("internal", "LINE linkage failed");
    }
  },
);

export const unlinkLineAccount = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  await db.collection("users").doc(request.auth.uid).set(
    {
      isLineLinked: false,
      lineUserId: admin.firestore.FieldValue.delete(),
      lineDisplayName: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );
  return { success: true };
});

// =========================================================
// 機能 3 & 4: 朝の挨拶とカンペ
// =========================================================
export const sendMorningBriefing = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
  },
  async (event) => {
    const usersSnap = await db.collection("users").get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      if (!userData.lineUserId) continue;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [memoriesSnap, todosSnap] = await Promise.all([
        db
          .collection("memories")
          .where("userId", "==", uid)
          .where("createdAt", ">=", yesterday)
          .orderBy("createdAt", "desc")
          .get(),
        db
          .collection("todos")
          .where("userId", "==", uid)
          .where("isCompleted", "==", false)
          .get(),
      ]);

      if (memoriesSnap.empty && todosSnap.empty) continue;

      const memoryText = memoriesSnap.docs
        .map((d) => `- ${d.data().text}`)
        .join("\n");
      const todoText = todosSnap.docs
        .map((d) => `- [未完了] ${d.data().title}`)
        .join("\n");

      const prompt = `
        おはようございます。秘書AIです。
        昨日のメモと残っているタスクから、今日のブリーフィングを作成してください。
        【昨日のメモ】${memoryText}
        【未完了タスク】${todoText}
        指示: 挨拶は元気に。「今日やるべきこと」を明確に。300文字以内。
      `;

      const briefing = await callGeminiText(apiKey, prompt);
      await client.pushMessage(userData.lineUserId, {
        type: "text",
        text: briefing,
      });
    }
  },
);

export const checkUpcomingMeetings = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
  },
  async (event) => {
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
      channelAccessToken: lineBotToken.value(),
    });

    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      if (!userData.lineUserId) continue;

      const tokenDoc = await db
        .collection("users")
        .doc(uid)
        .collection("system")
        .doc("tokens")
        .get();
      if (!tokenDoc.exists) continue;

      const refreshToken = tokenDoc.data()?.refreshToken;
      if (!refreshToken) continue;

      const accessToken = await refreshAccessToken(refreshToken);
      if (!accessToken) continue;

      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 20 * 60 * 1000).toISOString();

      try {
        const calendarRes = await axios.get(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              timeMin,
              timeMax,
              singleEvents: true,
              orderBy: "startTime",
            },
          },
        );

        const events = calendarRes.data.items || [];

        for (const ev of events) {
          const title = ev.summary;
          if (!title) continue;

          const recentMemoriesSnap = await db
            .collection("memories")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(30)
            .get();

          const memoryDump = recentMemoriesSnap.docs
            .map(
              (d) =>
                `[${d.data().createdAt.toDate().toLocaleDateString()}] ${d.data().text}`,
            )
            .join("\n");

          const cheatSheetPrompt = `
            これから「${title}」という予定があります。
            以下の過去のメモから、関連情報（名前、前回の話題、懸案事項など）を探し出し「直前カンニングペーパー」を作成して。
            【過去のメモ】${memoryDump}
            指示: 関連情報がない場合は「関連情報なし」と出力。ある場合は箇条書きで。
          `;

          const cheatSheet = await callGeminiText(apiKey, cheatSheetPrompt);

          if (
            !cheatSheet.includes("関連情報なし") &&
            !cheatSheet.includes("エラー")
          ) {
            await client.pushMessage(userData.lineUserId, {
              type: "text",
              text: `📅 まもなく開始: ${title}\n\n🧠 AIカンペ:\n${cheatSheet}`,
            });
          }
        }
      } catch (e) {
        console.error(`Calendar Error for user ${uid}:`, e);
      }
    }
  },
);

export const scrapeUrl = onCall(async () => {
  return { success: true };
});
