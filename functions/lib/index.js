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
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
(0, v2_1.setGlobalOptions)({ region: "asia-northeast1", memory: "1GiB" });
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
// 1. URLスクレイピング
exports.scrapeUrl = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { url } = request.data;
    try {
        const response = await axios_1.default.get(url, {
            headers: { "User-Agent": "Mozilla/5.0..." },
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
// 2. LINE連携 (アカウント紐付け) ★ここが追加されました
exports.linkLineAccount = (0, https_1.onCall)({ secrets: [lineLoginChannelId, lineLoginChannelSecret] }, async (request) => {
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
        const tokenRes = await axios_1.default.post("https://api.line.me/oauth2/v2.1/token", params);
        const { access_token } = tokenRes.data;
        const profileRes = await axios_1.default.get("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        await db.collection("users").doc(request.auth.uid).set({
            isLineLinked: true,
            lineUserId: profileRes.data.userId,
            lineDisplayName: profileRes.data.displayName,
        }, { merge: true });
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", "LINE連携失敗");
    }
});
// 3. LINE Webhook (ボット機能) ★ここが追加されました
exports.lineWebhook = (0, https_1.onRequest)({ secrets: [lineBotToken, lineBotSecret, geminiApiKey] }, async (req, res) => {
    const token = lineBotToken.value();
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;
    for (const event of events) {
        if (event.type !== "message")
            continue;
        const lineUserId = event.source.userId;
        if (!lineUserId)
            continue;
        // LINE IDからユーザーを特定
        const usersSnap = await db
            .collection("users")
            .where("lineUserId", "==", lineUserId)
            .limit(1)
            .get();
        if (usersSnap.empty) {
            await client.replyMessage(event.replyToken, {
                type: "text",
                text: "アプリでLINE連携を行ってください🙇‍♂️",
            });
            continue;
        }
        const uid = usersSnap.docs[0].id;
        try {
            if (event.message.type === "text") {
                await saveMemoryFromLine(uid, event.message.text, null);
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "📝 メモしました！",
                });
            }
            else if (event.message.type === "image") {
                const stream = await client.getMessageContent(event.message.id);
                const chunks = [];
                for await (const chunk of stream)
                    chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                await saveMemoryFromLine(uid, "LINE画像", {
                    data: buffer.toString("base64"),
                    mimeType: "image/jpeg",
                });
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "📷 画像を保存しました！",
                });
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    res.json({ success: true });
});
async function saveMemoryFromLine(uid, text, image) {
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let promptParts = [];
    if (image) {
        promptParts.push({ inlineData: image });
        promptParts.push({
            text: "画像を分析して記憶データを作成。出力JSON: {summary, tags, fullText}",
        });
    }
    else {
        promptParts.push({
            text: `テキストを整理。内容: ${text} 出力JSON: {summary, tags, fullText}`,
        });
    }
    const result = await model.generateContent(promptParts);
    const jsonStr = result.response
        .text()
        .replace(/```json|```/g, "")
        .trim();
    let aiData;
    try {
        aiData = JSON.parse(jsonStr);
    }
    catch (_a) {
        aiData = { fullText: text, summary: text.substring(0, 20), tags: ["LINE"] };
    }
    const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const embedRes = await embedModel.embedContent(aiData.fullText || text);
    await db.collection("memories").add({
        userId: uid,
        text: aiData.fullText || text,
        aiSummary: aiData.summary,
        tags: [...(aiData.tags || []), "LINE"],
        embedding: embedRes.embedding.values,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        hasImage: !!image,
        source: "LINE",
    });
}
