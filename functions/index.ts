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
setGlobalOptions({ region: "asia-northeast1", memory: "1GiB" });

const lineBotToken = defineSecret("LINE_BOT_TOKEN");
const lineBotSecret = defineSecret("LINE_BOT_SECRET");
const lineLoginChannelId = defineSecret("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = defineSecret("LINE_LOGIN_CHANNEL_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// 1. URLスクレイピング
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

// 2. LINE連携 (アカウント紐付け) ★ここが追加されました
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

// 3. LINE Webhook (ボット機能) ★ここが追加されました
export const lineWebhook = onRequest(
  { secrets: [lineBotToken, lineBotSecret, geminiApiKey] },
  async (req, res) => {
    const token = lineBotToken.value();
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;

    for (const event of events) {
      if (event.type !== "message") continue;
      const lineUserId = event.source.userId;
      if (!lineUserId) continue;

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
        } else if (event.message.type === "image") {
          const stream = await client.getMessageContent(event.message.id);
          const chunks: any[] = [];
          for await (const chunk of stream) chunks.push(chunk);
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
      } catch (e) {
        console.error(e);
      }
    }
    res.json({ success: true });
  },
);

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
