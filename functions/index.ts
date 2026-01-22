import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";
import * as line from "@line/bot-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// グローバル設定
setGlobalOptions({ region: "asia-northeast1", memory: "1GiB" });

const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// --------------------
// 1. URLスクレイピング
// --------------------
export const scrapeUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const { url } = request.data;
  try {
    const response = await axios.get(url, {
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
      if (text.length > 20) content += text + "\n";
    });
    return { success: true, title, content: content.slice(0, 50000) };
  } catch (error: any) {
    throw new HttpsError("internal", error.message);
  }
});

// --------------------
// 2. LINE連携 (ログイン用)
// --------------------
export const linkLineAccount = onCall(
  { secrets: [lineLoginChannelId, lineLoginChannelSecret] },
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
      const { access_token } = tokenRes.data;
      const profileRes = await axios.get("https://api.line.me/v2/profile", {
        headers: { Authorization: `Bearer ${access_token}` },
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
    } catch (error: any) {
      throw new HttpsError("internal", "LINE連携失敗");
    }
  },
);

// --------------------
// 3. LINE Webhook (★改良版: 質問応答機能を追加)
// --------------------
export const lineWebhook = onRequest(
  { secrets: [lineBotToken, lineBotSecret, geminiApiKey], cors: true },
  async (req, res) => {
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
      if (event.type !== "message") continue;

      const lineUserId = event.source.userId;
      if (!lineUserId) continue;

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
        } catch (err) {
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
        } else if (event.message.type === "image") {
          // 画像は今まで通り「メモ」として処理
          const stream = await client.getMessageContent(event.message.id);
          const chunks: any[] = [];
          for await (const chunk of stream) chunks.push(chunk);
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
      } catch (e: any) {
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
        } catch (replyErr) {
          console.error("Failed to send error message:", replyErr);
        }
      }
    }
    res.json({ success: true });
  },
);

// --------------------
// 4. LINE連携解除
// --------------------
export const unlinkLineAccount = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");

  try {
    await db.collection("users").doc(request.auth.uid).update({
      isLineLinked: false,
      lineUserId: admin.firestore.FieldValue.delete(),
      lineDisplayName: admin.firestore.FieldValue.delete(),
    });
    return { success: true };
  } catch (error: any) {
    throw new HttpsError("internal", "LINE解除失敗: " + error.message);
  }
});

// --------------------
// ヘルパー関数群
// --------------------

// モデル自動探索
async function getPrioritizedModels(apiKey: string): Promise<string[]> {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await axios.get(listUrl);
    const models = response.data.models || [];
    const viableModels = models
      .filter((m: any) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((m: any) => m.name.replace("models/", ""));

    const priority = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
      "gemini-1.5-pro-latest",
      "gemini-pro",
    ];

    const sortedModels = viableModels.sort((a: string, b: string) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    return sortedModels.length > 0 ? sortedModels : ["gemini-1.5-flash"];
  } catch (e) {
    console.warn("Model list fetch failed, using fallback list:", e);
    return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
  }
}

// コサイン類似度計算
function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
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
async function processLineMessage(
  uid: string,
  message: string,
): Promise<string> {
  const apiKey = geminiApiKey.value();
  const genAI = new GoogleGenerativeAI(apiKey);

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
    if (data.type === "question") type = "question";
  } catch (e) {
    console.warn("Intent detection failed, defaulting to memo.");
  }

  if (type === "memo") {
    return await saveMemoryFromLine(uid, message, null);
  } else {
    return await answerQuestion(uid, message, apiKey);
  }
}

// ★追加: 質問への回答生成ロジック (RAG)
async function answerQuestion(
  uid: string,
  question: string,
  apiKey: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
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
    } catch (e) {
      console.warn(`Model ${modelName} failed for QA:`, e);
    }
  }

  return "エラーが発生して思い出せませんでした...💦";
}

// 既存のメモ保存ロジック (そのまま維持)
async function saveMemoryFromLine(
  uid: string,
  text: string,
  image: { data: string; mimeType: string } | null,
): Promise<string> {
  const apiKey = geminiApiKey.value();
  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = await getPrioritizedModels(apiKey);

  let lastError: any;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      let promptParts: any[] = [];
      if (image) {
        promptParts.push({ inlineData: image });
        promptParts.push({
          text: "画像を分析して記憶データを作成。出力JSON: {summary, tags, fullText}",
        });
      } else {
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
      } catch {
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
    } catch (e: any) {
      lastError = e;
    }
  }
  throw lastError;
}
