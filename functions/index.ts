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

// モデル固定（安定性重視）
const TARGET_MODEL = "gemini-1.5-flash";

// ---------------------------------------------------------
// Helper: JSON抽出
// ---------------------------------------------------------
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
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        console.warn("No JSON found, falling back to chat.");
        return { action: "CHAT", reply: text };
      } catch (e3) {
        console.error("JSON Parse Error:", text);
        return { action: "CHAT", reply: text };
      }
    }
  }
}

// ---------------------------------------------------------
// Helper: IDクリーニング
// ---------------------------------------------------------
function cleanId(id: string): string {
  if (!id || typeof id !== "string") return "";
  return id.replace(/<<<|>>>|ID:/gi, "").trim();
}

// ---------------------------------------------------------
// Helper: AI Call
// ---------------------------------------------------------
async function callGeminiJson(apiKey: string, prompt: string): Promise<any> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TARGET_MODEL}:generateContent?key=${apiKey}`;
    const response = await axios.post(
      url,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json" } },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return extractJson(text);
  } catch (e: any) {
    console.error(`Gemini JSON Error:`, e.message);
    return { action: "CHAT", reply: "エラーが発生しました。" };
  }
  return { action: "CHAT", reply: "応答がありませんでした。" };
}

async function callGeminiText(apiKey: string, prompt: string): Promise<string> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TARGET_MODEL}:generateContent?key=${apiKey}`;
    const response = await axios.post(
      url,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json" } },
    );
    let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text
      .replace(/^```.*\n/gm, "")
      .replace(/```/g, "")
      .trim();
  } catch (e: any) {
    console.error(`Gemini Text Error:`, e.message);
    return "";
  }
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
    return null;
  }
}

// ---------------------------------------------------------
// Helper: Calendar & Todo
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
    if (!refreshToken) return "（権限なし）";
    const accessToken = await refreshAccessToken(refreshToken);
    if (!accessToken) return "（トークン切れ）";
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000,
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
          maxResults: 20,
        },
      },
    );
    const events = calendarRes.data.items || [];
    if (events.length === 0) return "直近の予定はありません。";
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
    return "（取得エラー）";
  }
}

async function addCalendarEvent(
  uid: string,
  eventData: { title: string; start: string; end: string },
): Promise<boolean> {
  try {
    const tokenDoc = await db
      .collection("users")
      .doc(uid)
      .collection("system")
      .doc("tokens")
      .get();
    if (!tokenDoc.exists) return false;
    const refreshToken = tokenDoc.data()?.refreshToken;
    const accessToken = await refreshAccessToken(refreshToken);
    if (!accessToken) return false;
    await axios.post(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        summary: eventData.title,
        start: { dateTime: eventData.start },
        end: { dateTime: eventData.end },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return true;
  } catch (e) {
    return false;
  }
}

async function deleteCalendarEvent(
  uid: string,
  query: string,
): Promise<string> {
  try {
    const tokenDoc = await db
      .collection("users")
      .doc(uid)
      .collection("system")
      .doc("tokens")
      .get();
    if (!tokenDoc.exists) return "連携されていません";
    const accessToken = await refreshAccessToken(tokenDoc.data()?.refreshToken);
    if (!accessToken) return "認証エラー";
    const searchRes = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { q: query, maxResults: 5, singleEvents: true },
      },
    );
    const events = searchRes.data.items || [];
    if (events.length === 0) return "該当する予定が見つかりませんでした。";
    const target = events[0];
    await axios.delete(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return `「${target.summary}」を削除しました。`;
  } catch (e) {
    return "削除に失敗しました。";
  }
}

async function deleteTodoByTitle(uid: string, title: string): Promise<string> {
  const todosRef = db.collection("todos");
  const snap = await todosRef
    .where("userId", "==", uid)
    .where("isCompleted", "==", false)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  const targetDoc = snap.docs.find((doc) => doc.data().title.includes(title));
  if (targetDoc) {
    await targetDoc.ref.delete();
    return `タスク「${targetDoc.data().title}」を削除しました。`;
  }
  return "タスクが見つかりませんでした。";
}

// ---------------------------------------------------------
// Helper: Memory Context
// ---------------------------------------------------------
async function getRecentMemories(
  uid: string,
  queryText: string,
): Promise<string> {
  try {
    const snapshot = await db
      .collection("memories")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    if (snapshot.empty) return "（履歴なし）";

    let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const keywords = queryText
      .replace(/[\s,、　]+/g, " ")
      .split(" ")
      .filter((k) => k.length > 1);
    const matches = docs.filter((d: any) =>
      keywords.some((k) => d.text.includes(k)),
    );
    const recents = docs.slice(0, 5);
    const candidates = [...recents, ...matches];
    const uniqueCandidates = Array.from(
      new Map(candidates.map((c) => [c.id, c])).values(),
    );

    return uniqueCandidates
      .map((data: any) => `<<<${data.id}>>> ${data.text.replace(/\n/g, " ")}`)
      .join("\n");
  } catch (e) {
    return "（取得エラー）";
  }
}

// =========================================================
// LINE Webhook (Context Aware)
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
        const message = event.message.text.trim();

        try {
          await db.collection("processed_events").doc(eventId).create({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: lineUserId,
          });
        } catch (e) {
          return;
        }

        const usersSnap = await db
          .collection("users")
          .where("lineUserId", "==", lineUserId)
          .limit(1)
          .get();
        if (usersSnap.empty) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "アプリで「LINE連携」ボタンを押してください。",
          });
          return;
        }
        const uid = usersSnap.docs[0].id;

        // ★ここが移植ポイント: バックエンドでも「直前のID」を覚える！
        const contextRef = db
          .collection("users")
          .doc(uid)
          .collection("system")
          .doc("user_context");
        const contextSnap = await contextRef.get();
        const lastMemoryId = contextSnap.exists
          ? contextSnap.data()?.lastMemoryId
          : null;

        // ★さらに重要: 覚えているIDの中身も取得してAIに見せる
        let activeMemoryContent = "";
        if (lastMemoryId) {
          const memRef = db.collection("memories").doc(lastMemoryId);
          const memSnap = await memRef.get();
          if (memSnap.exists) {
            activeMemoryContent = `【直前に操作・参照していたメモ】\nID: <<<${lastMemoryId}>>>\n内容: ${memSnap.data()?.text}`;
          }
        }

        // 1. 強制モード
        const commands: Record<string, string> = {
          "【モード】タスク": "TASK",
          "【モード】メモ": "MEMORY",
          "【モード】カレンダー": "CALENDAR",
          "【モード】お任せ": "AUTO",
          "【モード】リセット": "AUTO",
        };
        if (commands[message]) {
          await db
            .collection("users")
            .doc(uid)
            .update({ lineMode: commands[message] });
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: `✅ ${commands[message]}モードになりました。`,
          });
          return;
        }

        // 2. コンテキスト取得
        const memoryContext = await getRecentMemories(uid, message);
        const nowStr = new Date().toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        });

        // 3. 司令塔プロンプト (Context Aware)
        const routerPrompt = `
        現在日時: ${nowStr}
        ユーザー入力: "${message}"

        ${activeMemoryContent ? activeMemoryContent : "直前のメモ参照なし"}

        【その他参照可能なメモ】(IDは<<< >>>で囲われています)
        ${memoryContext}

        指示:
        ユーザーの意図を汲み取り、以下のJSON形式のみを出力してください。
        
        ★重要: 「これ」「あれ」「さっきの」「リストから」などの指示語がある場合は、【直前に操作・参照していたメモ】を最優先で対象にしてください。

        ★アクション判断基準:
        1. 【メモ編集・部分削除】 "〇〇を消して" "リストから〇〇を削除" "〇〇を変更して"
           -> "MEMORY_EDIT"
           - targetId: 対象ID (「これ」なら直前のID)
           - instruction: 具体的な編集指示（例：「『牛乳』の行を削除」「『13時』を『14時』に変更」）
        
        2. 【メモ追記】 "これ追加して" "〇〇も買っておいて"
           -> "MEMORY_APPEND"
           - targetId: 対象ID (「これ」なら直前のID)
           - content: 追加する内容

        3. 【タスク削除】 "タスク消して" "タスク完了" -> "TASK_DELETE"
        4. 【予定削除】 "予定消して" "キャンセル" -> "CALENDAR_DELETE"
        5. 【予定追加】 日時指定がある場合 -> "CALENDAR_ADD"
        6. 【メモ保存】 上記以外 -> "MEMORY_ADD"
        7. 【会話】 挨拶や質問 -> "CHAT"

        出力JSON形式:
        {
          "action": "ACTION_NAME",
          "targetId": "ID文字列 (<<<と>>>は除く)",
          "instruction": "編集指示の内容",
          "content": "追記・保存する内容",
          "reply": "ユーザーへの短い返信"
        }
      `;

        // 4. アクション決定
        const aiDecision = await callGeminiJson(apiKey, routerPrompt);

        const action = aiDecision.action || "CHAT";
        const data = aiDecision.data || aiDecision;

        // AIがIDを出さない場合でも、直前のIDがあればそれを使う（フォールバック）
        const rawTargetId = data.targetId;
        const targetId =
          cleanId(rawTargetId) ||
          (action === "MEMORY_EDIT" || action === "MEMORY_APPEND"
            ? lastMemoryId
            : null);

        const instruction = data.instruction;
        const content = data.content || message;
        let replyText = data.reply || "処理しました";

        // 次回のために覚えるID
        let nextMemoryId = targetId || lastMemoryId;

        // 5. アクション実行
        if (action === "MEMORY_EDIT" && targetId && instruction) {
          try {
            const docRef = db.collection("memories").doc(targetId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
              const currentText = docSnap.data()?.text || "";
              const editPrompt = `あなたはテキストエディタです。以下のテキストを指示通りに修正し、修正後の**全文のみ**を出力してください。\n\n【元テキスト】\n${currentText}\n\n【指示】\n${instruction}`;
              const newText = await callGeminiText(apiKey, editPrompt);
              if (newText) {
                await docRef.update({ text: newText.trim() });
                replyText = `📝 更新しました。\n\n${newText.trim()}`;
                nextMemoryId = targetId; // 操作成功したので覚える
              } else {
                replyText = "⚠️ 更新内容が空でした。";
              }
            } else {
              replyText = "⚠️ 指定されたメモが見つかりませんでした。";
            }
          } catch {
            replyText = "⚠️ 更新に失敗しました。";
          }
        } else if (action === "MEMORY_APPEND" && targetId) {
          try {
            const docRef = db.collection("memories").doc(targetId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
              const oldText = docSnap.data()?.text || "";
              const newText = `${oldText}\n${content}`;
              await docRef.update({ text: newText });
              replyText = `📝 追記しました: ${content}`;
              nextMemoryId = targetId;
            } else {
              replyText = `⚠️ 追記先のメモが見つかりませんでした。`;
            }
          } catch {
            replyText = "⚠️ 追記に失敗しました。";
          }
        } else if (action === "TASK_DELETE") {
          replyText = await deleteTodoByTitle(uid, content);
        } else if (action === "CALENDAR_DELETE") {
          replyText = await deleteCalendarEvent(uid, content);
        } else if (action === "CALENDAR_ADD") {
          if (data.start) {
            await addCalendarEvent(uid, data);
            replyText = `📅 予定を登録しました: ${content}`;
          } else {
            replyText = "📅 予定の追加はWebアプリから行うと確実です。";
          }
        } else if (action === "TASK_ADD") {
          await db.collection("todos").add({
            userId: uid,
            title: content,
            isCompleted: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          replyText = `✅ タスク追加: ${content}`;
        } else if (action === "MEMORY_ADD") {
          const ref = await db.collection("memories").add({
            userId: uid,
            text: content,
            aiSummary: content.slice(0, 20),
            tags: ["Memo", "LINE"],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "LINE",
          });
          replyText = `📝 メモしました`;
          nextMemoryId = ref.id; // 新規作成したIDを覚える
        } else if (action === "CHAT") {
          // 会話であっても、参照されたIDがあれば覚える
          if (targetId) nextMemoryId = targetId;
        }

        // ★IDをコンテキストに保存（次回用）
        if (nextMemoryId) {
          await contextRef.set({ lastMemoryId: nextMemoryId }, { merge: true });
        }

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: replyText,
        });
      }),
    );

    res.json({ success: true });
  },
);

// その他機能
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
      await db
        .collection("users")
        .doc(request.auth.uid)
        .set(
          { isLineLinked: true, lineUserId: profileRes.data.userId },
          { merge: true },
        );
      return { success: true };
    } catch (e: any) {
      throw new HttpsError("internal", e.message);
    }
  },
);

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
      const prompt = `おはようございます。今日のブリーフィングです。\n昨日: ${memoryText}\n未完了タスク: ${todoText}\n元気に300文字以内で。`;
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
      const accessToken = await refreshAccessToken(
        tokenDoc.data()?.refreshToken,
      );
      if (!accessToken) continue;
      const now = new Date();
      try {
        const calendarRes = await axios.get(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              timeMin: now.toISOString(),
              timeMax: new Date(now.getTime() + 20 * 60000).toISOString(),
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
          const cheatSheetPrompt = `「${title}」の直前カンペ作成。過去メモ: ${memoryDump} 関連情報なければ「関連情報なし」と出力。`;
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
