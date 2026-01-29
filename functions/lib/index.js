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
exports.scrapeUrl = exports.checkUpcomingMeetings = exports.sendMorningBriefing = exports.unlinkLineAccount = exports.linkLineAccount = exports.lineWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const line = __importStar(require("@line/bot-sdk"));
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
// メモリ設定
(0, v2_1.setGlobalOptions)({
    region: "asia-northeast1",
    memory: "1GiB",
    timeoutSeconds: 60,
});
// Secrets
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
// フォールバック用のモデルリスト
const CANDIDATE_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
    "gemini-pro",
];
// ---------------------------------------------------------
// Helper: JSON抽出・修復関数
// ---------------------------------------------------------
function extractJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (e) {
        try {
            const cleaned = text.replace(/```json|```/g, "").trim();
            return JSON.parse(cleaned);
        }
        catch (e2) {
            try {
                const firstOpen = text.indexOf("{");
                const lastClose = text.lastIndexOf("}");
                if (firstOpen !== -1 && lastClose !== -1) {
                    const jsonString = text.substring(firstOpen, lastClose + 1);
                    return JSON.parse(jsonString);
                }
                throw new Error("No JSON found");
            }
            catch (e3) {
                throw new Error("JSON parsing failed");
            }
        }
    }
}
// ---------------------------------------------------------
// Helper: AI Model Management (変更なし・安定版)
// ---------------------------------------------------------
async function fetchAvailableModels(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResponse = await axios_1.default.get(listUrl);
        if (listResponse.status !== 200)
            return [];
        return listResponse.data.models || [];
    }
    catch (e) {
        console.warn("Failed to fetch model list:", e);
        return [];
    }
}
async function resolveGeminiModel(apiKey) {
    const models = await fetchAvailableModels(apiKey);
    const generationModels = models.filter((m) => { var _a; return (_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes("generateContent"); });
    let target = generationModels.find((m) => m.name.includes("gemini-1.5-flash"));
    if (!target) {
        target = generationModels.find((m) => m.name.includes("gemini-1.5-pro"));
    }
    if (!target && generationModels.length > 0) {
        target = generationModels[0];
    }
    if (target) {
        return target.name.replace("models/", "");
    }
    return "gemini-1.5-flash";
}
async function callGeminiJson(apiKey, prompt) {
    var _a, _b, _c, _d, _e, _f;
    const dynamicModel = await resolveGeminiModel(apiKey);
    const modelsToTry = [...new Set([dynamicModel, ...CANDIDATE_MODELS])].filter(Boolean);
    for (const modelName of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await axios_1.default.post(url, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" },
            }, { headers: { "Content-Type": "application/json" } });
            const text = (_f = (_e = (_d = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text;
            if (text) {
                return extractJson(text);
            }
        }
        catch (e) {
            console.warn(`Model ${modelName} failed: ${e.message}. Retrying...`);
        }
    }
    throw new Error("All AI models failed to generate valid JSON");
}
async function callGeminiText(apiKey, prompt) {
    var _a, _b, _c, _d, _e, _f;
    const dynamicModel = await resolveGeminiModel(apiKey);
    const modelsToTry = [...new Set([dynamicModel, ...CANDIDATE_MODELS])].filter(Boolean);
    for (const modelName of modelsToTry) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await axios_1.default.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { "Content-Type": "application/json" } });
            return ((_f = (_e = (_d = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) || "";
        }
        catch (e) {
            console.warn(`Model ${modelName} (Text) failed. Retrying...`);
        }
    }
    return "すみません、AIの調子が悪く応答できませんでした。";
}
// ---------------------------------------------------------
// Helper: Google Token Refresh & Calendar
// ---------------------------------------------------------
async function refreshAccessToken(refreshToken) {
    try {
        const response = await axios_1.default.post("https://oauth2.googleapis.com/token", {
            client_id: googleClientId.value(),
            client_secret: googleClientSecret.value(),
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        return response.data.access_token;
    }
    catch (e) {
        console.error("Token Refresh Error:", e.message);
        return null;
    }
}
async function getCalendarEvents(uid) {
    var _a;
    try {
        const tokenDoc = await db
            .collection("users")
            .doc(uid)
            .collection("system")
            .doc("tokens")
            .get();
        if (!tokenDoc.exists)
            return "（カレンダー未連携）";
        const refreshToken = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.refreshToken;
        if (!refreshToken)
            return "（カレンダー権限なし）";
        const accessToken = await refreshAccessToken(refreshToken);
        if (!accessToken)
            return "（トークン期限切れ）";
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const calendarRes = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 15,
            },
        });
        const events = calendarRes.data.items || [];
        if (events.length === 0)
            return "直近1週間の予定はありません。";
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
        console.error("Calendar Fetch Error:", e);
        return "（カレンダー取得エラー）";
    }
}
async function addCalendarEvent(uid, eventData) {
    var _a;
    try {
        const tokenDoc = await db
            .collection("users")
            .doc(uid)
            .collection("system")
            .doc("tokens")
            .get();
        if (!tokenDoc.exists)
            return false;
        const refreshToken = (_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.refreshToken;
        if (!refreshToken)
            return false;
        const accessToken = await refreshAccessToken(refreshToken);
        if (!accessToken)
            return false;
        await axios_1.default.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            summary: eventData.title,
            start: { dateTime: eventData.start },
            end: { dateTime: eventData.end },
        }, { headers: { Authorization: `Bearer ${accessToken}` } });
        return true;
    }
    catch (e) {
        console.error("Add Event Error:", e);
        return false;
    }
}
// ★修正: 最新50件からキーワード検索で執念深く探すロジックに変更
async function getRecentMemories(uid, queryText) {
    try {
        // 1. 直近50件を取得（数を増やす）
        const snapshot = await db
            .collection("memories")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
        if (snapshot.empty)
            return "（履歴なし）";
        let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // 2. キーワードフィルタリング（"買い物リスト"等の言葉があれば優先抽出）
        const keywords = queryText
            .replace(/[\s,、　]+/g, " ")
            .split(" ")
            .filter((k) => k.length > 1);
        const matches = docs.filter((d) => keywords.some((k) => d.text.includes(k)));
        const recents = docs.slice(0, 3); // 直近3件も文脈用に残す
        // 重複を排除して結合
        const candidates = [...recents, ...matches];
        const uniqueCandidates = Array.from(new Map(candidates.map((c) => [c.id, c])).values());
        if (uniqueCandidates.length === 0)
            return "（関連する履歴なし）";
        return uniqueCandidates
            .map((data) => {
            var _a;
            let dateStr = "";
            if ((_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) {
                const date = data.createdAt.toDate();
                const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
                const timeLabel = diffMin < 60
                    ? `${diffMin}分前`
                    : date.toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    });
                dateStr = `[${timeLabel}]`;
            }
            // AIが「どこに追記するか」判断できるようにIDを含める
            return `ID:${data.id} | ${dateStr} ${data.text.replace(/\n/g, " ")}`;
        })
            .join("\n");
    }
    catch (e) {
        return "（メモ取得エラー）";
    }
}
// =========================================================
// 機能 1: LINE Webhook (スーパー秘書モード)
// =========================================================
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
    if (!token || !apiKey) {
        res.status(500).send("Config Error");
        return;
    }
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;
    await Promise.all(events.map(async (event) => {
        var _a, _b;
        if (event.type !== "message" || event.message.type !== "text")
            return;
        const eventId = event.webhookEventId;
        const lineUserId = event.source.userId;
        const message = event.message.text.trim();
        // 重複排除
        try {
            await db.collection("processed_events").doc(eventId).create({
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                userId: lineUserId,
            });
        }
        catch (e) {
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
                text: "アプリで「LINE連携」ボタンを押してね🙇‍♂️",
            });
            return;
        }
        const uid = usersSnap.docs[0].id;
        // 1. 強制モード切替コマンド
        const commands = {
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
            const replyText = commands[message] === "AUTO"
                ? "🤖 お任せモードになりました。\nAIが内容を判断します。"
                : `✅ ${commands[message]}モードになりました。`;
            await client.replyMessage(event.replyToken, {
                type: "text",
                text: replyText,
            });
            return;
        }
        // 2. モードと文脈取得
        const userDoc = await db.collection("users").doc(uid).get();
        const currentMode = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.lineMode) || "AUTO";
        // ★ここでメッセージを渡して、関連するメモを強力に検索する
        const memoryContext = await getRecentMemories(uid, message);
        const nowStr = new Date().toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
        });
        // ★司令塔プロンプト（ユーザーの意図をAIが判断）
        const routerPrompt = `
          あなたは優秀な秘書AIです。現在日時: ${nowStr}
          ユーザー入力: "${message}"
          【参照可能なメモ(ID付)】
          ${memoryContext}

          指示:
          ユーザーの意図を汲み取り、アクションを決定してください。
          「これ」「あれ」「さっきの」は、直近のメモを指します。
          「買い物リスト」と言われたら、過去のメモから「買い物リスト」を探して追記してください。
          
          モード: ${currentMode}
          - "これ追加して"等の指示があり、直近の記憶に関連するものがあれば MEMORY_APPEND
          - TASKモードなら TASK_ADD
          - MEMORYモードなら MEMORY_ADD
          - CALENDARモードなら CALENDAR_READ (または文脈によってはADD)
          - AUTOモードなら文脈から判断

          出力JSON形式:
          {
            "action": "CALENDAR_ADD" | "CALENDAR_READ" | "TASK_ADD" | "MEMORY_ADD" | "MEMORY_APPEND" | "CHAT",
            "data": {
              "title": "予定/タスク名",
              "start": "ISO8601日時",
              "end": "ISO8601日時",
              "summary": "要約",
              "targetId": "MEMORY_APPENDの場合の対象ID",
              "content": "追加する内容テキスト",
              "tags": ["タグ"]
            },
            "reply": "ユーザーへの返信メッセージ (短く親切に)"
          }
        `;
        let aiDecision = {};
        try {
            aiDecision = await callGeminiJson(apiKey, routerPrompt);
        }
        catch (e) {
            // AI失敗時のフェイルセーフ
            aiDecision = {
                action: currentMode === "TASK" ? "TASK_ADD" : "MEMORY_ADD",
                data: { title: message, summary: message.slice(0, 20), tags: [] },
                reply: "AIエラーのためそのまま保存しました。",
            };
        }
        // 3. アクション実行
        const action = aiDecision.action;
        const data = aiDecision.data || {};
        let replyText = aiDecision.reply || "処理しました";
        if (action === "MEMORY_APPEND" && data.targetId) {
            // ★既存メモへの追記
            try {
                const docRef = db.collection("memories").doc(data.targetId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    const oldText = ((_b = docSnap.data()) === null || _b === void 0 ? void 0 : _b.text) || "";
                    // 改行して追記
                    const newText = `${oldText}\n${data.content || message}`;
                    await docRef.update({ text: newText });
                    replyText = `📝 既存のメモに追記しました: ${data.content || message}`;
                }
                else {
                    // IDが見つからない場合は新規作成
                    await db.collection("memories").add({
                        userId: uid,
                        text: message,
                        aiSummary: message.slice(0, 20),
                        tags: ["Memo", "LINE"],
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        source: "LINE",
                    });
                    replyText = `📝 (対象が見つからず) 新規メモとして保存しました。`;
                }
            }
            catch (e) {
                replyText = "⚠️ 追記に失敗しました。";
            }
        }
        else if (action === "CALENDAR_ADD") {
            // ★カレンダー登録
            if (data.start) {
                const success = await addCalendarEvent(uid, {
                    title: data.title || message,
                    start: data.start,
                    end: data.end || data.start,
                });
                replyText = success
                    ? `📅 予定を登録しました: ${data.title}`
                    : "⚠️ カレンダー登録に失敗しました。連携設定を確認してください。";
            }
            else {
                replyText = "日時が特定できませんでした。";
            }
        }
        else if (action === "CALENDAR_READ") {
            // カレンダー参照
            const eventsText = await getCalendarEvents(uid);
            replyText = await callGeminiText(apiKey, `質問: "${message}"\n予定:\n${eventsText}\nこれを見て答えて。`);
        }
        else if (action === "TASK_ADD") {
            // タスク追加
            await db.collection("todos").add({
                userId: uid,
                title: data.title || message,
                isCompleted: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "LINE",
            });
            // 念のためメモにも
            await db.collection("memories").add({
                userId: uid,
                text: message,
                aiSummary: `[Task] ${data.summary || message}`,
                tags: [...(data.tags || []), "Task"],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "LINE",
            });
            replyText = `✅ タスクに追加しました: ${data.title}`;
        }
        else if (action === "MEMORY_ADD") {
            // メモ保存
            await db.collection("memories").add({
                userId: uid,
                text: message,
                aiSummary: data.summary || message.slice(0, 20),
                tags: [...(data.tags || []), "Memo"],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "LINE",
            });
            replyText = `📝 メモしました: ${data.summary}`;
        }
        else {
            // CHAT (AIの返信をそのまま使う)
        }
        await client.replyMessage(event.replyToken, {
            type: "text",
            text: replyText,
        });
    }));
    res.json({ success: true });
});
// =========================================================
// 機能 2, 3, 4 (変更なし)
// =========================================================
exports.linkLineAccount = (0, https_1.onCall)({
    secrets: [
        lineLoginChannelId,
        lineLoginChannelSecret,
        lineBotToken,
        lineBotSecret,
    ],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { code, redirectUri } = request.data;
    const clientId = lineLoginChannelId.value();
    const clientSecret = lineLoginChannelSecret.value();
    if (!clientId || !clientSecret) {
        throw new https_1.HttpsError("failed-precondition", "LINE secrets not set");
    }
    try {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);
        params.append("client_id", clientId);
        params.append("client_secret", clientSecret);
        const tokenResponse = await axios_1.default.post("https://api.line.me/oauth2/v2.1/token", params);
        const { access_token } = tokenResponse.data;
        const profileResponse = await axios_1.default.get("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${access_token}` } });
        await db.collection("users").doc(request.auth.uid).set({
            isLineLinked: true,
            lineUserId: profileResponse.data.userId,
            lineDisplayName: profileResponse.data.displayName,
        }, { merge: true });
        return { success: true };
    }
    catch (error) {
        console.error("LINE Link Error:", error.message);
        throw new https_1.HttpsError("internal", "LINE linkage failed");
    }
});
exports.unlinkLineAccount = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    await db.collection("users").doc(request.auth.uid).set({
        isLineLinked: false,
        lineUserId: admin.firestore.FieldValue.delete(),
        lineDisplayName: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return { success: true };
});
exports.sendMorningBriefing = (0, scheduler_1.onSchedule)({
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
}, async (event) => {
    const usersSnap = await db.collection("users").get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        if (!userData.lineUserId)
            continue;
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
        if (memoriesSnap.empty && todosSnap.empty)
            continue;
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
});
exports.checkUpcomingMeetings = (0, scheduler_1.onSchedule)({
    schedule: "every 15 minutes",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
}, async (event) => {
    var _a;
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const usersSnap = await db.collection("users").get();
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        if (!userData.lineUserId)
            continue;
        const tokenDoc = await db
            .collection("users")
            .doc(uid)
            .collection("system")
            .doc("tokens")
            .get();
        if (!tokenDoc.exists)
            continue;
        const accessToken = await refreshAccessToken((_a = tokenDoc.data()) === null || _a === void 0 ? void 0 : _a.refreshToken);
        if (!accessToken)
            continue;
        const now = new Date();
        try {
            const calendarRes = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    timeMin: now.toISOString(),
                    timeMax: new Date(now.getTime() + 20 * 60000).toISOString(),
                    singleEvents: true,
                    orderBy: "startTime",
                },
            });
            const events = calendarRes.data.items || [];
            for (const ev of events) {
                const title = ev.summary;
                if (!title)
                    continue;
                const recentMemoriesSnap = await db
                    .collection("memories")
                    .where("userId", "==", uid)
                    .orderBy("createdAt", "desc")
                    .limit(30)
                    .get();
                const memoryDump = recentMemoriesSnap.docs
                    .map((d) => `[${d.data().createdAt.toDate().toLocaleDateString()}] ${d.data().text}`)
                    .join("\n");
                const cheatSheetPrompt = `「${title}」の直前カンペ作成。過去メモ: ${memoryDump} 関連情報なければ「関連情報なし」と出力。`;
                const cheatSheet = await callGeminiText(apiKey, cheatSheetPrompt);
                if (!cheatSheet.includes("関連情報なし") &&
                    !cheatSheet.includes("エラー")) {
                    await client.pushMessage(userData.lineUserId, {
                        type: "text",
                        text: `📅 まもなく開始: ${title}\n\n🧠 AIカンペ:\n${cheatSheet}`,
                    });
                }
            }
        }
        catch (e) {
            console.error(`Calendar Error for user ${uid}:`, e);
        }
    }
});
exports.scrapeUrl = (0, https_1.onCall)(async () => {
    return { success: true };
});
