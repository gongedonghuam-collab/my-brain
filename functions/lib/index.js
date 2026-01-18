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
exports.lineWebhook = exports.linkLineAccount = exports.scrapeUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const line = __importStar(require("@line/bot-sdk"));
const generative_ai_1 = require("@google/generative-ai");
// 初期化
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
// 日本リージョンに設定
(0, v2_1.setGlobalOptions)({ region: "asia-northeast1", memory: "1GiB" });
// 秘密鍵の定義
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
// ---------------------------------------------------------
// 1. URLスクレイピング
// ---------------------------------------------------------
exports.scrapeUrl = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required");
    }
    const { url } = request.data;
    try {
        const response = await axios_1.default.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
            timeout: 10000,
        });
        const $ = cheerio.load(response.data);
        $("script").remove();
        $("style").remove();
        const title = $("title").text().trim() || "No Title";
        let content = "";
        $("p, h1, h2, article").each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 20)
                content += text + "\n";
        });
        return { success: true, title, content: content.slice(0, 50000) };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", error.message);
    }
});
// ---------------------------------------------------------
// 2. LINE連携 (アカウント紐付け) ★これが抜けていました！
// ---------------------------------------------------------
exports.linkLineAccount = (0, https_1.onCall)({
    secrets: [
        lineLoginChannelId,
        lineLoginChannelSecret,
        lineBotToken,
        lineBotSecret,
    ],
}, async (request) => {
    var _a;
    // ログインチェック
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "ログインが必要です");
    }
    const { code, redirectUri } = request.data;
    try {
        // 1. LINEからアクセストークンを取得
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);
        params.append("client_id", lineLoginChannelId.value());
        params.append("client_secret", lineLoginChannelSecret.value());
        const tokenResponse = await axios_1.default.post("https://api.line.me/oauth2/v2.1/token", params);
        const { access_token } = tokenResponse.data;
        // 2. アクセストークンを使ってプロフィール(LINE UserID)を取得
        const profileResponse = await axios_1.default.get("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${access_token}` } });
        const lineUserId = profileResponse.data.userId;
        const lineDisplayName = profileResponse.data.displayName;
        // 3. Firestoreのユーザー情報にLINE IDを書き込む
        await db.collection("users").doc(request.auth.uid).set({
            isLineLinked: true,
            lineUserId: lineUserId,
            lineDisplayName: lineDisplayName,
        }, { merge: true });
        return { success: true };
    }
    catch (error) {
        console.error("LINE Link Error:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error);
        throw new https_1.HttpsError("internal", "LINE連携に失敗しました");
    }
});
// ---------------------------------------------------------
// 3. LINE Webhook (ボット機能)
// ---------------------------------------------------------
exports.lineWebhook = (0, https_1.onRequest)({ secrets: [lineBotToken, lineBotSecret, geminiApiKey] }, async (req, res) => {
    const events = req.body.events;
    const token = lineBotToken.value();
    const client = new line.Client({ channelAccessToken: token });
    for (const event of events) {
        if (event.type !== "message")
            continue;
        const lineUserId = event.source.userId;
        if (!lineUserId)
            continue;
        // LINE IDと紐づくユーザーを探す
        const usersSnap = await db
            .collection("users")
            .where("lineUserId", "==", lineUserId)
            .limit(1)
            .get();
        if (usersSnap.empty) {
            await client.replyMessage(event.replyToken, {
                type: "text",
                text: "My Brainと連携されていません。アプリ設定から連携してください🙇‍♂️",
            });
            continue;
        }
        const userDoc = usersSnap.docs[0];
        const uid = userDoc.id;
        try {
            if (event.message.type === "text") {
                const text = event.message.text;
                await saveMemoryFromLine(uid, text, null);
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "📝 メモを脳に保存しました！",
                });
            }
            else if (event.message.type === "image") {
                const stream = await client.getMessageContent(event.message.id);
                const chunks = [];
                for await (const chunk of stream)
                    chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString("base64");
                await saveMemoryFromLine(uid, "LINEからの画像", {
                    data: base64,
                    mimeType: "image/jpeg",
                });
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "📷 画像を解析して保存しました！",
                });
            }
        }
        catch (err) {
            console.error("LINE Error:", err);
        }
    }
    res.json({ success: true });
});
// サーバー側でのAI保存ヘルパー関数
async function saveMemoryFromLine(uid, text, image) {
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let promptParts = [];
    if (image) {
        promptParts.push({ inlineData: image });
        promptParts.push({
            text: 'この画像を分析して記憶データを作成してください。出力形式: JSON {"summary": "20字要約", "tags": ["タグ"], "fullText": "詳細な内容"}',
        });
    }
    else {
        promptParts.push({
            text: `以下のテキストを記憶データとして整理してください。\n${text}\n出力形式: JSON {\"summary\": \"20字要約\", \"tags\": [\"タグ\"], \"fullText\": \"${text}\"}`,
        });
    }
    try {
        const result = await model.generateContent(promptParts);
        const responseText = result.response.text();
        const cleanJson = responseText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
        let aiData;
        try {
            aiData = JSON.parse(cleanJson);
        }
        catch (_a) {
            aiData = {
                fullText: text,
                summary: text.slice(0, 20) + "...",
                tags: ["LINE"],
            };
        }
        const embedModel = genAI.getGenerativeModel({
            model: "text-embedding-004",
        });
        const embedRes = await embedModel.embedContent(aiData.fullText || text);
        await db.collection("memories").add({
            userId: uid,
            text: aiData.fullText || text,
            aiSummary: aiData.summary,
            tags: aiData.tags,
            embedding: embedRes.embedding.values,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            hasImage: !!image,
            source: "LINE",
        });
    }
    catch (e) {
        console.error("Save Memory Error:", e);
    }
}
