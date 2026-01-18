import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";
import * as line from "@line/bot-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 初期化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
// 日本リージョンに設定
setGlobalOptions({ region: "asia-northeast1", memory: "1GiB" });

// 秘密鍵の定義
const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// ---------------------------------------------------------
// 1. URLスクレイピング
// ---------------------------------------------------------
export const scrapeUrl = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const { url } = request.data;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
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
      if (text.length > 20) content += text + "\n";
    });
    return { success: true, title, content: content.slice(0, 50000) };
  } catch (error: any) {
    throw new HttpsError("internal", error.message);
  }
});

// ---------------------------------------------------------
// 2. LINE連携 (アカウント紐付け) ★これが抜けていました！
// ---------------------------------------------------------
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
    // ログインチェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です");
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

      const tokenResponse = await axios.post(
        "https://api.line.me/oauth2/v2.1/token",
        params,
      );
      const { access_token } = tokenResponse.data;

      // 2. アクセストークンを使ってプロフィール(LINE UserID)を取得
      const profileResponse = await axios.get(
        "https://api.line.me/v2/profile",
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      const lineUserId = profileResponse.data.userId;
      const lineDisplayName = profileResponse.data.displayName;

      // 3. Firestoreのユーザー情報にLINE IDを書き込む
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
      console.error("LINE Link Error:", error.response?.data || error);
      throw new HttpsError("internal", "LINE連携に失敗しました");
    }
  },
);

// ---------------------------------------------------------
// 3. LINE Webhook (ボット機能)
// ---------------------------------------------------------
export const lineWebhook = onRequest(
  { secrets: [lineBotToken, lineBotSecret, geminiApiKey] },
  async (req, res) => {
    const events = req.body.events;
    const token = lineBotToken.value();
    const client = new line.Client({ channelAccessToken: token });

    for (const event of events) {
      if (event.type !== "message") continue;

      const lineUserId = event.source.userId;
      if (!lineUserId) continue;

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
        } else if (event.message.type === "image") {
          const stream = await client.getMessageContent(event.message.id);
          const chunks: any[] = [];
          for await (const chunk of stream) chunks.push(chunk);
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
      } catch (err) {
        console.error("LINE Error:", err);
      }
    }
    res.json({ success: true });
  },
);

// サーバー側でのAI保存ヘルパー関数
async function saveMemoryFromLine(
  uid: string,
  text: string,
  image: { data: string; mimeType: string } | null,
) {
  const apiKey = geminiApiKey.value();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  let promptParts: any[] = [];
  if (image) {
    promptParts.push({ inlineData: image });
    promptParts.push({
      text: 'この画像を分析して記憶データを作成してください。出力形式: JSON {"summary": "20字要約", "tags": ["タグ"], "fullText": "詳細な内容"}',
    });
  } else {
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
    } catch {
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
  } catch (e) {
    console.error("Save Memory Error:", e);
  }
}
