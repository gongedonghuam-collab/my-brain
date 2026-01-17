import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";

// 初期化
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// 日本リージョンに設定
setGlobalOptions({ region: "asia-northeast1", memory: "1GiB" });

/**
 * URLを受け取り、Webページのタイトルと本文テキストを返す関数
 */
export const scrapeUrl = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です");
  }

  const { url } = request.data;
  if (!url) {
    throw new HttpsError("invalid-argument", "URLが必要です");
  }

  try {
    // 1. HTMLを取得
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 10000, // 10秒タイムアウト
    });

    // 2. HTMLを解析 (cheerio)
    const $ = cheerio.load(response.data);

    // 不要な要素を削除
    $("script").remove();
    $("style").remove();
    $("nav").remove();
    $("footer").remove();
    $("header").remove();
    $("iframe").remove();

    // タイトルと本文を取得
    const title = $("title").text().trim() || "No Title";

    // 本文抽出（pタグや記事本文と思われる箇所を優先）
    let content = "";
    $("p, h1, h2, h3, h4, li, article").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        // 短すぎるゴミテキストを除外
        content += text + "\n";
      }
    });

    // 文字数制限（Geminiに渡すため長すぎると困る場合があるが、Flashならかなりいける）
    const limitedContent = content.slice(0, 50000); // 5万文字でカット

    return {
      success: true,
      title,
      content: limitedContent,
    };
  } catch (error: any) {
    console.error("Scraping Error:", error);
    throw new HttpsError(
      "internal",
      `読み込みに失敗しました: ${error.message}`,
    );
  }
});
