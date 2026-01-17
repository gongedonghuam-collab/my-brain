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
exports.sendDailyReminders = exports.notifyOnReservationDeleted = exports.notifyOnReservationCreated = exports.lineWebhook = exports.sendAutoThanksLine = exports.searchProduct = exports.getAiRecommendation = exports.linkLineAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const line = __importStar(require("@line/bot-sdk"));
const generative_ai_1 = require("@google/generative-ai");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
(0, v2_1.setGlobalOptions)({
    region: "asia-northeast1",
    memory: "1GiB",
    maxInstances: 10,
});
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const yahooAppId = (0, params_1.defineSecret)("YAHOO_APP_ID");
// --- 通知送信ヘルパー ---
const sendPushNotification = async (uid, title, body) => {
    var _a;
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const tokens = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) || [];
        if (tokens.length > 0) {
            const message = { notification: { title, body }, tokens: tokens };
            await admin.messaging().sendEachForMulticast(message);
        }
    }
    catch (e) {
        console.error("FCM Error:", e);
    }
};
const sendLineNotification = async (uid, message, token, secret) => {
    var _a;
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const lineUserId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.lineUserId;
        if (lineUserId) {
            const client = new line.Client({
                channelAccessToken: token,
                channelSecret: secret,
            });
            await client.pushMessage(lineUserId, { type: "text", text: message });
        }
    }
    catch (e) {
        console.error("LINE Error:", e);
    }
};
// --- 機能実装 ---
// 1. LINE連携
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
    try {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);
        params.append("client_id", lineLoginChannelId.value());
        params.append("client_secret", lineLoginChannelSecret.value());
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
        throw new https_1.HttpsError("internal", error.message);
    }
});
// 2. AI (Magic Karte) - 強制整形版
exports.getAiRecommendation = (0, https_1.onCall)({ secrets: [geminiApiKey] }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
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
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        // ★JSONモードのみ指定（SchemaTypeは使わない）
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" },
        });
        const prompt = `
        美容師のアシスタントAIです。
        以下の【メモ】を元に、JSONデータのみを出力してください。
        挨拶や余計な文章は一切不要です。

        【メモ】
        ${roughNote}

        【出力形式】
        {
            "technical": "美容師向けの専門的なカルテ文章（施術内容、薬剤など）",
            "line": "お客様へ送るサンクスLINEの文章（絵文字を使い、親しみやすく）"
        }
        `;
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        // ★強制クリーニング処理
        // AIが Markdown (```json ... ```) をつけた場合や、前後に文字を入れた場合に対応
        text = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
        }
        else {
            // JSONが見つからない場合、無理やりJSONを作って返す
            return {
                rawText: JSON.stringify({
                    technical: text,
                    line: "生成内容を確認してください",
                }),
            };
        }
        // 念のためパース確認（ここで失敗してもcatchで拾う）
        JSON.parse(text);
        return { rawText: text };
    }
    catch (e) {
        console.error("AI Error:", e);
        // エラーでもJSONを返してアプリが落ちないようにする
        return {
            rawText: JSON.stringify({
                technical: "AI生成に失敗しました",
                line: "手動で入力してください",
            }),
        };
    }
});
// 3. 商品検索
exports.searchProduct = (0, https_1.onCall)({ secrets: [yahooAppId] }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { code } = request.data;
    const appId = yahooAppId.value();
    if (!code || !appId)
        return { name: null };
    try {
        const res = await axios_1.default.get(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${appId}&jan_code=${code}&results=1`);
        return { name: ((_b = (_a = res.data.hits) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.name) || null };
    }
    catch (e) {
        return { name: null };
    }
});
// 4. サンクスLINE自動送信 - 確実版
exports.sendAutoThanksLine = (0, firestore_1.onDocumentCreated)({ document: "logs/{logId}", secrets: [lineBotToken, lineBotSecret] }, async (event) => {
    var _a, _b;
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No snapshot data");
        return;
    }
    const logData = snapshot.data();
    // ★重要: stylistId が無い場合は authorId (作成者) を代用
    const stylistId = logData.stylistId || logData.authorId;
    const customerId = logData.customerId;
    const customLineMessage = logData.customLineMessage;
    console.log(`[ThanksLine] Start. Stylist:${stylistId} Customer:${customerId}`);
    if (!stylistId || !customerId) {
        console.error("[ThanksLine] ID不足のため中止");
        return;
    }
    try {
        // 設定チェック
        const settingsRef = db
            .collection("users")
            .doc(stylistId)
            .collection("system")
            .doc("auto_messages");
        const settingsSnap = await settingsRef.get();
        // 設定ドキュメント自体がない場合は「有効」として扱う
        const settings = settingsSnap.exists
            ? settingsSnap.data()
            : { enabled: true };
        if ((settings === null || settings === void 0 ? void 0 : settings.enabled) === false) {
            console.log("[ThanksLine] 自動送信設定がOFFです");
            return;
        }
        // 顧客のLINE連携チェック
        const customerRef = await db.collection("users").doc(customerId).get();
        const lineUserId = (_a = customerRef.data()) === null || _a === void 0 ? void 0 : _a.lineUserId;
        const customerName = ((_b = customerRef.data()) === null || _b === void 0 ? void 0 : _b.name) || "お客様";
        if (!lineUserId) {
            console.log("[ThanksLine] 顧客がLINE未連携");
            return;
        }
        const template = (settings === null || settings === void 0 ? void 0 : settings.template) ||
            "{name}様\n\n本日はご来店ありがとうございました！";
        const msg = customLineMessage || template.replace(/\{name\}/g, customerName);
        const token = lineBotToken.value();
        const secret = lineBotSecret.value();
        if (!token) {
            console.error("[ThanksLine] Token未設定");
            return;
        }
        const client = new line.Client({
            channelAccessToken: token,
            channelSecret: secret,
        });
        await client.pushMessage(lineUserId, { type: "text", text: msg });
        console.log(`[ThanksLine] 送信成功: ${lineUserId}`);
    }
    catch (e) {
        console.error("[ThanksLine] エラー:", e);
    }
});
// 5. LINE Webhook
exports.lineWebhook = (0, https_1.onRequest)({ secrets: [lineBotToken, lineBotSecret] }, async (req, res) => {
    res.json({ success: true });
});
// 6. 予約作成通知
exports.notifyOnReservationCreated = (0, firestore_1.onDocumentCreated)({
    document: "reservations/{reservationId}",
    secrets: [lineBotToken, lineBotSecret],
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    const { stylistId, customerId, customerName, date, time, createdBy } = data;
    const token = lineBotToken.value();
    const secret = lineBotSecret.value();
    const msg = `【予約完了】\n${customerName}様\n📅 ${date} ${time}`;
    if (createdBy === customerId) {
        await sendPushNotification(stylistId, "新着予約", msg);
        await sendLineNotification(stylistId, msg, token, secret);
    }
    else if (createdBy === stylistId) {
        await sendPushNotification(customerId, "予約のお知らせ", msg);
        await sendLineNotification(customerId, msg, token, secret);
    }
    else {
        await sendPushNotification(stylistId, "新着予約", msg);
        await sendPushNotification(customerId, "予約のお知らせ", msg);
    }
    try {
        const connectionsRef = db.collection("connections");
        const querySnapshot = await connectionsRef
            .where("stylistId", "==", stylistId)
            .where("customerId", "==", customerId)
            .get();
        if (!querySnapshot.empty) {
            const batch = db.batch();
            querySnapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { nextReservation: date });
            });
            await batch.commit();
        }
    }
    catch (e) {
        console.error("Next reservation error", e);
    }
});
// 7. 予約キャンセル通知
exports.notifyOnReservationDeleted = (0, firestore_1.onDocumentDeleted)({
    document: "reservations/{reservationId}",
    secrets: [lineBotToken, lineBotSecret],
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    const { stylistId, customerId, customerName, date, time } = data;
    const token = lineBotToken.value();
    const secret = lineBotSecret.value();
    const msg = `【予約キャンセル】\n${customerName}様\n📅 ${date} ${time}\n予約が取り消されました。`;
    await sendPushNotification(stylistId, "予約キャンセル", msg);
    await sendLineNotification(stylistId, msg, token, secret);
    await sendPushNotification(customerId, "予約キャンセル", msg);
    await sendLineNotification(customerId, msg, token, secret);
});
// 8. リマインダー通知
exports.sendDailyReminders = (0, scheduler_1.onSchedule)("every day 09:00", async (event) => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const tomorrowStr = today.toISOString().split("T")[0];
    const snapshot = await db
        .collection("reservations")
        .where("date", "==", tomorrowStr)
        .get();
    if (snapshot.empty)
        return;
    snapshot.forEach(async (doc) => {
        const data = doc.data();
        const msg = `【リマインダー】\n明日 ${data.time} よりご予約がございます。\nお待ちしております！`;
        await sendPushNotification(data.customerId, "ご予約のリマインダー", msg);
    });
});
