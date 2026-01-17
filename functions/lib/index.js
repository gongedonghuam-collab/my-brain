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
exports.scrapeUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
// 初期化
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// 日本リージョンに設定
(0, v2_1.setGlobalOptions)({ region: "asia-northeast1", memory: "1GiB" });
/**
 * URLを受け取り、Webページのタイトルと本文テキストを返す関数
 */
exports.scrapeUrl = (0, https_1.onCall)(async (request) => {
    // 認証チェック
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "ログインが必要です");
    }
    const { url } = request.data;
    if (!url) {
        throw new https_1.HttpsError("invalid-argument", "URLが必要です");
    }
    try {
        // 1. HTMLを取得
        const response = await axios_1.default.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
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
    }
    catch (error) {
        console.error("Scraping Error:", error);
        throw new https_1.HttpsError("internal", `読み込みに失敗しました: ${error.message}`);
    }
});
