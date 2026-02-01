"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceTriggerNotification = exports.lineWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const line = __importStar(require("@line/bot-sdk"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
// タイムアウト300秒
(0, v2_1.setGlobalOptions)({
    region: "asia-northeast1",
    memory: "1GiB",
    timeoutSeconds: 300,
});
// Secrets
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
// 予備のモデルリスト
const CANDIDATE_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
    "gemini-pro",
];
// Helper: Clean Text
function cleanAiReply(text) {
    if (!text)
        return "";
    return text
        .replace(/📝 メモを更新しました/g, "")
        .replace(/📝 メモに追記しました/g, "")
        .replace(/📝 メモしました/g, "")
        .replace(/✅ .*しました/g, "")
        .replace(/⚠️ .*失敗しました/g, "")
        .replace(/(\n|^)[-・*]\s+.+/g, "")
        .trim();
}
// Helper: JSON extraction
function extractJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (e) {
        try {
            const cleaned = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            return JSON.parse(cleaned);
        }
        catch (e2) {
            return { action: "CHAT", reply: text };
        }
    }
}
function cleanId(id) {
    if (!id || typeof id !== "string")
        return "";
    return id.replace(/<<<|>>>|ID:/gi, "").trim();
}
function formatIsoDate(dateStr) {
    if (!dateStr)
        return "";
    if (dateStr.includes("+") || dateStr.endsWith("Z"))
        return dateStr;
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
        return `${dateStr}:00+09:00`;
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/))
        return `${dateStr}+09:00`;
    return dateStr;
}
// AI Helpers
async function fetchAvailableModels(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await axios_1.default.get(listUrl);
        return res.data.models || [];
    }
    catch (_a) {
        return [];
    }
}
async function resolveGeminiModel(apiKey) {
    const models = await fetchAvailableModels(apiKey);
    const target = models.find((m) => m.name.includes("gemini-1.5-flash")) ||
        models.find((m) => m.name.includes("gemini-1.5-pro"));
    return target ? target.name.replace("models/", "") : "gemini-1.5-flash";
}
async function generateContentWithRetry(apiKey, prompt) {
    var _a, _b, _c, _d, _e, _f;
    const bestModel = await resolveGeminiModel(apiKey);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${bestModel}:generateContent?key=${apiKey}`;
    const response = await axios_1.default.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { "Content-Type": "application/json" } });
    return ((_f = (_e = (_d = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) || "";
}
async function callGeminiJson(apiKey, prompt) {
    if (!apiKey)
        return { action: "CHAT", reply: "API Key Error" };
    try {
        const text = await generateContentWithRetry(apiKey, prompt);
        return extractJson(text);
    }
    catch (e) {
        return { action: "CHAT", reply: `AI Error: ${e.message}` };
    }
}
async function callGeminiText(apiKey, prompt) {
    if (!apiKey)
        return "";
    try {
        const text = await generateContentWithRetry(apiKey, prompt);
        return text
            .replace(/^```.*\n/gm, "")
            .replace(/```/g, "")
            .trim();
    }
    catch (_a) {
        return "";
    }
}
// ★修正: トークン取得ロジック（Refresh失敗ならAccessを使う）
async function getValidAccessToken(uid) {
    try {
        const tokenDoc = await db
            .collection("users")
            .doc(uid)
            .collection("system")
            .doc("tokens")
            .get();
        if (!tokenDoc.exists)
            return null;
        const data = tokenDoc.data();
        // 1. リフレッシュトークンで更新を試みる
        if (data === null || data === void 0 ? void 0 : data.refreshToken) {
            try {
                const response = await axios_1.default.post("https://oauth2.googleapis.com/token", {
                    client_id: googleClientId.value(),
                    client_secret: googleClientSecret.value(),
                    refresh_token: data.refreshToken,
                    grant_type: "refresh_token",
                });
                return response.data.access_token;
            }
            catch (e) {
                console.warn("Refresh failed, falling back to stored accessToken");
            }
        }
        // 2. 更新失敗 or なければ、保存されているアクセストークンを使う (1時間以内なら有効)
        if (data === null || data === void 0 ? void 0 : data.accessToken) {
            return data.accessToken;
        }
        return null;
    }
    catch (e) {
        return null;
    }
}
// ---------------------------------------------------------
// Helper: Calendar Operations (Use new token logic)
// ---------------------------------------------------------
async function getCalendarEvents(uid) {
    const token = await getValidAccessToken(uid);
    if (!token)
        return "（連携エラー: 再ログインしてください）";
    try {
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const res = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 20,
            },
        });
        const events = res.data.items || [];
        if (events.length === 0)
            return "直近の予定なし";
        return events
            .map((ev) => {
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
    }
    catch (e) {
        return "（取得失敗）";
    }
}
async function addCalendarEvent(uid, eventData) {
    const token = await getValidAccessToken(uid);
    if (!token)
        return false;
    try {
        await axios_1.default.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            summary: eventData.title,
            start: { dateTime: formatIsoDate(eventData.start) },
            end: { dateTime: formatIsoDate(eventData.end) },
        }, { headers: { Authorization: `Bearer ${token}` } });
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function deleteCalendarEvent(uid, query) {
    const token = await getValidAccessToken(uid);
    if (!token)
        return "連携エラー: アプリで再ログインしてください。";
    try {
        const search = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { q: query, maxResults: 5, singleEvents: true },
        });
        const events = search.data.items || [];
        if (events.length === 0)
            return "該当する予定が見つかりませんでした。";
        const target = events[0];
        await axios_1.default.delete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return `「${target.summary}」を削除しました。`;
    }
    catch (_a) {
        return "削除に失敗しました。";
    }
}
async function deleteTodoByTitle(uid, title) {
    // ... (No change, Firestore only)
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
// ... getRecentMemories, getChatHistory (No change) ...
async function getRecentMemories(uid, query) {
    // ... (Same as before)
    const snap = await db
        .collection("memories")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
    return snap.docs.map((d) => `<<<${d.id}>>> ${d.data().text}`).join("\n");
}
async function getChatHistory(uid) {
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
// Webhook
exports.lineWebhook = (0, https_1.onRequest)({
    secrets: [
        lineBotToken,
        lineBotSecret,
        geminiApiKey,
        googleClientId,
        googleClientSecret,
    ],
    cors: true,
}, async (req, res) => {
    const token = lineBotToken.value();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;
    await Promise.all(events.map(async (event) => {
        if (event.type !== "message" || event.message.type !== "text")
            return;
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
        // ... Mode Switch (Simplified) ...
        // ... Context & AI ...
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
        }
        else if (action === "CALENDAR_ADD") {
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
            }
            else {
                replyText += "\n予定の追加に失敗しました。再ログインしてください。";
            }
        }
        // ... Other actions (Task, Memory) ...
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
    }));
    res.json({ success: true });
});
// Force Notification (Uses provided accessToken or DB token)
exports.forceTriggerNotification = (0, https_1.onCall)({
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
    cors: true,
}, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const uid = request.auth.uid;
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    // 1. Get Token (Try Request param -> DB AccessToken -> DB RefreshToken)
    let token = request.data.accessToken;
    if (!token)
        token = await getValidAccessToken(uid);
    if (!token)
        return {
            result: "トークンがありません。アプリで再ログインしてください。",
        };
    // 2. Fetch Calendar
    let events = [];
    try {
        const now = new Date();
        const res = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${now.toISOString()}&maxResults=1`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        events = res.data.items || [];
    }
    catch (e) {
        return { result: "カレンダー取得失敗: " + e.message };
    }
    const title = events.length > 0 ? events[0].summary : "(直近の予定なし)";
    // 3. AI Gen
    const cheatSheet = await callGeminiText(geminiApiKey.value(), `「${title}」に関する短いカンペを作って。挨拶不要。`);
    // 4. Send & Log
    await client.pushMessage((_a = (await db.collection("users").doc(uid).get()).data()) === null || _a === void 0 ? void 0 : _a.lineUserId, {
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
});
// Other exports... (scrapeUrl, etc.)
