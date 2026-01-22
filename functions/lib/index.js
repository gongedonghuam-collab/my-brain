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
exports.unlinkLineAccount = exports.lineWebhook = exports.linkLineAccount = exports.scrapeUrl = void 0;
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
// グローバル設定
(0, v2_1.setGlobalOptions)({ region: "asia-northeast1", memory: "1GiB" });
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
// --------------------
// 1. URLスクレイピング
// --------------------
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
// --------------------
// 2. LINE連携 (ログイン用)
// --------------------
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
// --------------------
// 3. LINE Webhook (★改良版: 質問応答機能を追加)
// --------------------
exports.lineWebhook = (0, https_1.onRequest)({ secrets: [lineBotToken, lineBotSecret, geminiApiKey], cors: true }, async (req, res) => {
    console.log("LINE Webhook Triggered");
    const token = lineBotToken.value();
    if (!token) {
        console.error("LINE_BOT_TOKEN is not set.");
        res.status(500).send("Config Error");
        return;
    }
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;
    for (const event of events) {
        if (event.type !== "message")
            continue;
        const lineUserId = event.source.userId;
        if (!lineUserId)
            continue;
        const usersSnap = await db
            .collection("users")
            .where("lineUserId", "==", lineUserId)
            .limit(1)
            .get();
        if (usersSnap.empty) {
            try {
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "⚠️ まだアプリと連携されていません。\nアプリの「設定」>「LINE連携」ボタンを押して連携してください！",
                });
            }
            catch (err) {
                console.error("Error sending reply:", err);
            }
            continue;
        }
        const uid = usersSnap.docs[0].id;
        try {
            if (event.message.type === "text") {
                const userMessage = event.message.text;
                // ★ここで「メモ」か「質問」かを判断して処理を分岐させる
                const resultText = await processLineMessage(uid, userMessage);
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: resultText,
                });
            }
            else if (event.message.type === "image") {
                // 画像は今まで通り「メモ」として処理
                const stream = await client.getMessageContent(event.message.id);
                const chunks = [];
                for await (const chunk of stream)
                    chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                const resultText = await saveMemoryFromLine(uid, "LINE画像", {
                    data: buffer.toString("base64"),
                    mimeType: "image/jpeg",
                });
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: resultText,
                });
            }
        }
        catch (e) {
            console.error("Error processing message:", e);
            try {
                let errorMsg = "エラーが発生しました💦";
                if (e.message.includes("429")) {
                    errorMsg =
                        "⚠️ AIの利用上限に達しました。しばらく待ってから試してください。";
                }
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: errorMsg,
                });
            }
            catch (replyErr) {
                console.error("Failed to send error message:", replyErr);
            }
        }
    }
    res.json({ success: true });
});
// --------------------
// 4. LINE連携解除
// --------------------
exports.unlinkLineAccount = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    try {
        await db.collection("users").doc(request.auth.uid).update({
            isLineLinked: false,
            lineUserId: admin.firestore.FieldValue.delete(),
            lineDisplayName: admin.firestore.FieldValue.delete(),
        });
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", "LINE解除失敗: " + error.message);
    }
});
// --------------------
// ヘルパー関数群
// --------------------
// モデル自動探索
async function getPrioritizedModels(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await axios_1.default.get(listUrl);
        const models = response.data.models || [];
        const viableModels = models
            .filter((m) => { var _a; return (_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes("generateContent"); })
            .map((m) => m.name.replace("models/", ""));
        const priority = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro",
            "gemini-1.5-pro-latest",
            "gemini-pro",
        ];
        const sortedModels = viableModels.sort((a, b) => {
            const idxA = priority.indexOf(a);
            const idxB = priority.indexOf(b);
            if (idxA !== -1 && idxB !== -1)
                return idxA - idxB;
            if (idxA !== -1)
                return -1;
            if (idxB !== -1)
                return 1;
            return 0;
        });
        return sortedModels.length > 0 ? sortedModels : ["gemini-1.5-flash"];
    }
    catch (e) {
        console.warn("Model list fetch failed, using fallback list:", e);
        return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    }
}
// コサイン類似度計算
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
// ★追加: メッセージ処理の分岐ロジック
async function processLineMessage(uid, message) {
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    // まずは軽いモデルで「意図判定」を行う
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
    ユーザーからのメッセージ: "${message}"
    
    これは「単なるメモ/記録」ですか？ それとも「質問/検索/呼び出し」ですか？
    JSONで答えてください。
    出力例: {"type": "memo"} または {"type": "question"}
  `;
    let type = "memo"; // デフォルトはメモ
    try {
        const result = await model.generateContent(prompt);
        const jsonStr = result.response
            .text()
            .replace(/```json|```/g, "")
            .trim();
        const data = JSON.parse(jsonStr);
        if (data.type === "question")
            type = "question";
    }
    catch (e) {
        console.warn("Intent detection failed, defaulting to memo.");
    }
    if (type === "memo") {
        return await saveMemoryFromLine(uid, message, null);
    }
    else {
        return await answerQuestion(uid, message, apiKey);
    }
}
// ★追加: 質問への回答生成ロジック (RAG)
async function answerQuestion(uid, question, apiKey) {
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    // 1. 質問をベクトル化
    const qEmbed = await embedModel.embedContent(question);
    const qVec = qEmbed.embedding.values;
    // 2. Firestoreから全メモリを取得して類似度検索 (※データ量が増えたらPinecone等への移行を推奨)
    // 現状は直近100件程度を取得して比較する簡易実装
    const memoriesSnap = await db
        .collection("memories")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
    const candidates = memoriesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
            text: data.text,
            similarity: data.embedding ? cosineSimilarity(qVec, data.embedding) : 0,
        };
    });
    // 類似度が高い順にソートして上位3つを抽出
    const relevantMemories = candidates
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
        .map((c) => c.text)
        .join("\n---\n");
    if (!relevantMemories) {
        return "すみません、関連する記憶が見つかりませんでした💦";
    }
    // 3. 回答生成
    const candidateModels = await getPrioritizedModels(apiKey);
    for (const modelName of candidateModels) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const prompt = `
        あなたはユーザーの「第2の脳」です。以下の【記憶】を元に、【質問】に答えてください。
        
        【質問】 ${question}
        
        【関連する記憶】
        ${relevantMemories}
        
        回答はLINEで読みやすいように簡潔に。
      `;
            const result = await model.generateContent(prompt);
            return `🧠 ${result.response.text()}`;
        }
        catch (e) {
            console.warn(`Model ${modelName} failed for QA:`, e);
        }
    }
    return "エラーが発生して思い出せませんでした...💦";
}
// 既存のメモ保存ロジック (そのまま維持)
async function saveMemoryFromLine(uid, text, image) {
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const candidateModels = await getPrioritizedModels(apiKey);
    let lastError;
    for (const modelName of candidateModels) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
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
                aiData = {
                    fullText: text,
                    summary: text.substring(0, 20),
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
                tags: [...(aiData.tags || []), "LINE"],
                embedding: embedRes.embedding.values,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                hasImage: !!image,
                source: "LINE",
                fileType: !!image ? "image/jpeg" : null,
            });
            return image ? "📷 画像を保存しました！" : "📝 メモしました！";
        }
        catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}
