"use strict";
// ==============================================================================
//  My Brain (AI秘書) バックエンドプログラム
//
//  【役割】
//  LINEからのメッセージを受け取り、Google Gemini (AI) に考えさせ、
//  カレンダー登録やメモ保存、タスク管理を自動で行う「中枢神経」です。
// ==============================================================================
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
exports.forceTriggerNotification = exports.scrapeUrl = exports.unlinkLineAccount = exports.linkLineAccount = exports.sendMorningBriefing = exports.checkRoutinePatterns = exports.checkUpcomingMeetings = exports.lineWebhook = exports.refreshCalendarToken = void 0;
// --- 1. 道具箱 (ライブラリのインポート) ---
const https_1 = require("firebase-functions/v2/https"); // ウェブからの通信(HTTP)を受け取る機能
const scheduler_1 = require("firebase-functions/v2/scheduler"); // 時間指定で定期実行する機能
const v2_1 = require("firebase-functions/v2"); // 関数全体の設定を行う機能
const params_1 = require("firebase-functions/params"); // パスワードなどの秘密情報を安全に扱う機能
const admin = __importStar(require("firebase-admin")); // データベース(Firestore)を管理者権限で操作する機能
const axios_1 = __importDefault(require("axios")); // 外部のサイト(Googleや天気予報)と通信する機能
const line = __importStar(require("@line/bot-sdk")); // LINEにメッセージを送るための公式ツール
// ★修正: GoogleGenerativeAI をインポート
const generative_ai_1 = require("@google/generative-ai");
// --- 2. アプリの起動準備 ---
// サーバーが立ち上がった時に一度だけ実行され、管理者としてログインします。
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore(); // データベース「Firestore」を操作する変数を準備
// --- 3. 基本設定 ---
// AIは考えるのに時間がかかるため、タイムアウトを長め(300秒)に設定します。
// メモリも1GiB確保して、処理落ちを防ぎます。
(0, v2_1.setGlobalOptions)({
    region: "asia-northeast1", // サーバーの場所: 東京 (近いほうが通信が速い)
    memory: "1GiB", // コンピュータの作業領域の広さ
    timeoutSeconds: 300, // 制限時間: 5分
});
// --- 4. 秘密の鍵 (シークレット) の読み込み ---
// コードに直接書くと危険な「鍵」を、Firebaseの金庫から取り出します。
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN"); // LINEボットを動かすためのトークン
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET"); // LINE通信の改ざんを防ぐ秘密鍵
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY"); // AI(Gemini)を使うためのAPIキー
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID"); // Googleカレンダー連携用のID
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET"); // Googleカレンダー連携用のパスワード
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID"); // LINEログイン機能用のID
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET"); // LINEログイン機能用のパスワード
const openWeatherApiKey = (0, params_1.defineSecret)("OPENWEATHER_API_KEY"); // 天気予報を取得するためのAPIキー
// AIモデルの候補リスト
// メインのモデルが調子悪い時、予備のモデルを使えるようにリスト化しています。
const CANDIDATE_MODELS = [
    "gemini-1.5-flash", // 速いモデル (メイン)
    "gemini-1.5-flash-001",
    "gemini-1.5-pro", // 賢いモデル (サブ)
    "gemini-pro",
];
// =========================================================
// [デザイン室] LINEに送る「カード」の見た目を作る場所
// =========================================================
// アプリ全体のテーマカラー定義
// ここを変えるだけで、LINE通知の雰囲気を一括変更できます。
const COLORS = {
    primary: "#6366f1", // 青紫 (メインカラー: 知的な印象)
    success: "#10b981", // 緑 (成功・完了)
    warning: "#f59e0b", // 黄 (注意・保存)
    danger: "#ef4444", // 赤 (警告・削除)
    info: "#0ea5e9", // 水色 (天気・情報)
    dark: "#1e293b", // 濃いグレー (背景色)
    text: "#334155", // 文字色
    textLight: "#94a3b8", // 薄い文字色
};
/**
 * ⚠️ [警告カード] を作成する関数
 * ダブルブッキングや移動時間が足りない時に、赤色の警告メッセージを表示します。
 *
 * @param title - 警告のタイトル（例：「ダブルブッキング警告」）
 * @param message - 警告の詳細メッセージ
 * @param suggestion - (任意) AIからの解決案（例：「時間をずらしますか？」）
 * @returns LINE Flex Message のオブジェクト
 */
function createAlertFlex(title, message, suggestion) {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "⚠️", size: "sm" },
                        {
                            type: "text",
                            text: "SCHEDULE ALERT",
                            color: "#ffffff",
                            weight: "bold",
                            size: "xxs",
                            margin: "sm",
                        },
                    ],
                    alignItems: "center",
                },
                {
                    type: "text",
                    text: title,
                    color: "#ffffff",
                    weight: "bold",
                    size: "md",
                    margin: "md",
                    wrap: true,
                },
            ],
            backgroundColor: COLORS.danger, // 背景を赤にする
            paddingAll: "20px",
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: message,
                    color: COLORS.text,
                    size: "sm",
                    wrap: true,
                    lineSpacing: "4px",
                },
                // AIからの提案がある場合のみ、区切り線を入れて表示する
                suggestion
                    ? {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            { type: "separator", margin: "lg", color: "#f1f5f9" },
                            {
                                type: "text",
                                text: "💡 AI SUGGESTION",
                                size: "xxs",
                                weight: "bold",
                                color: COLORS.primary,
                                margin: "lg",
                            },
                            {
                                type: "text",
                                text: suggestion,
                                size: "sm",
                                color: COLORS.dark,
                                wrap: true,
                                margin: "sm",
                                weight: "bold",
                            },
                        ],
                    }
                    : { type: "spacer", size: "xs" },
            ],
            paddingAll: "20px",
            backgroundColor: "#fff1f2", // 薄い赤の背景
        },
    };
}
/**
 * 📅 [カレンダー登録カード] を作成する関数
 * 予定の日時や場所、天気予報の警告をきれいに整形して表示します。
 *
 * @param title - 予定のタイトル
 * @param start - 開始日時 (ISO形式文字列)
 * @param end - 終了日時 (ISO形式文字列)
 * @param location - (任意) 場所
 * @param weatherInfo - (任意) 天気予報のアラート文
 * @returns LINE Flex Message のオブジェクト
 */
function createCalendarFlex(title, start, end, location, weatherInfo) {
    // ISO形式の日時を、人間が読みやすい形（例: 12/25 10:00）に変換する処理
    const startDate = new Date(start);
    const dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    const timeStr = `${startDate.getHours()}:${startDate.getMinutes().toString().padStart(2, "0")}`;
    const weekDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][startDate.getDay()];
    // カードの中身を組み立てるリスト
    const bodyContents = [
        {
            type: "box",
            layout: "horizontal",
            contents: [
                {
                    type: "text",
                    text: dateStr,
                    size: "3xl",
                    weight: "bold",
                    color: COLORS.text,
                    flex: 0,
                },
                {
                    type: "text",
                    text: weekDay,
                    size: "sm",
                    color: COLORS.danger,
                    weight: "bold",
                    margin: "md",
                    offsetTop: "12px",
                },
            ],
            alignItems: "flex-end", // 日付と曜日を下揃えにする
        },
        {
            type: "text",
            text: timeStr + " ~",
            size: "xl",
            weight: "bold",
            color: COLORS.primary,
            margin: "sm",
        },
        { type: "separator", margin: "lg", color: "#f1f5f9" },
        {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: title,
                    size: "lg",
                    weight: "bold",
                    color: COLORS.text,
                    wrap: true,
                },
                // 場所情報があるときだけ表示するブロック
                location
                    ? {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            { type: "text", text: "📍", size: "xs", flex: 0 },
                            {
                                type: "text",
                                text: location,
                                size: "xs",
                                color: COLORS.textLight,
                                margin: "sm",
                            },
                        ],
                        margin: "sm",
                    }
                    : { type: "spacer", size: "xs" },
            ],
            margin: "lg",
        },
    ];
    // 雨予報などの警告があれば、カードの下に追記する
    if (weatherInfo) {
        bodyContents.push({
            type: "box",
            layout: "vertical",
            contents: [
                { type: "separator", margin: "lg", color: "#f1f5f9" },
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "☔", size: "sm" },
                        {
                            type: "text",
                            text: "WEATHER ALERT",
                            size: "xxs",
                            weight: "bold",
                            color: COLORS.info,
                            margin: "sm",
                            offsetTop: "1px",
                        },
                    ],
                    margin: "lg",
                },
                {
                    type: "text",
                    text: weatherInfo,
                    size: "xs",
                    color: COLORS.text,
                    margin: "sm",
                    wrap: true,
                },
            ],
        });
    }
    // 最終的なカード構造を返す
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: "SCHEDULED",
                    color: "#ffffff",
                    weight: "bold",
                    size: "xxs",
                },
                {
                    type: "text",
                    text: "予定を登録しました",
                    color: "#ffffff",
                    weight: "bold",
                    size: "sm",
                    margin: "sm",
                },
            ],
            backgroundColor: COLORS.primary,
            paddingAll: "20px",
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: bodyContents,
            paddingAll: "20px",
        },
        footer: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "Googleカレンダーを開く",
                        uri: "https://calendar.google.com/",
                    },
                    style: "secondary",
                    height: "sm",
                },
            ],
            paddingAll: "20px",
        },
    };
}
/**
 * ✅ [タスク追加カード] を作成する関数
 * @param title - タスク名
 */
function createTaskFlex(title) {
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "horizontal",
            contents: [
                {
                    type: "box",
                    layout: "vertical",
                    contents: [{ type: "text", text: "✅", size: "xxl" }],
                    width: "40px",
                    justifyContent: "center",
                },
                {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "TASK ADDED",
                            size: "xxs",
                            weight: "bold",
                            color: COLORS.success,
                        },
                        {
                            type: "text",
                            text: title,
                            size: "md",
                            weight: "bold",
                            color: COLORS.text,
                            wrap: true,
                            margin: "xs",
                        },
                    ],
                    margin: "md",
                },
            ],
            paddingAll: "20px",
            backgroundColor: "#f0fdf4", // 薄い緑
            cornerRadius: "xl",
            borderColor: COLORS.success,
            borderWidth: "light",
        },
    };
}
/**
 * 🧠 [メモ保存カード] を作成する関数
 * @param text - メモの本文
 * @param isUpdate - 更新か新規か (trueなら更新)
 */
function createMemoryFlex(text, isUpdate = false) {
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        {
                            type: "text",
                            text: isUpdate ? "📝 MEMO UPDATED" : "🧠 MEMORY SAVED",
                            weight: "bold",
                            size: "xxs",
                            color: COLORS.warning,
                        },
                        {
                            type: "text",
                            text: "My Brain",
                            weight: "bold",
                            size: "xxs",
                            color: "#cbd5e1",
                            align: "end",
                        },
                    ],
                },
                {
                    type: "text",
                    text: text,
                    size: "sm",
                    color: COLORS.text,
                    wrap: true,
                    maxLines: 5,
                    margin: "md",
                    lineSpacing: "4px",
                },
            ],
            paddingAll: "20px",
            backgroundColor: "#fffbeb", // 薄い黄色
            cornerRadius: "xl",
            borderColor: COLORS.warning,
            borderWidth: "light",
        },
    };
}
/**
 * 🔔 [直前カンペ通知カード] を作成する関数
 * 会議や予定の前に、AIが関連情報をまとめて通知する際に使います。
 * @param title - 予定のタイトル
 * @param summary - AIが生成した要約（カンペ）
 */
function createCheatSheetFlex(title, summary) {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "🔴", size: "xs", flex: 0, margin: "sm" },
                        {
                            type: "text",
                            text: "IN 15 MIN",
                            weight: "bold",
                            color: "#ffffff",
                            size: "xs",
                            margin: "sm",
                        },
                    ],
                    backgroundColor: "rgba(0,0,0,0.2)",
                    cornerRadius: "20px",
                    paddingAll: "4px",
                    width: "90px",
                    alignItems: "center",
                },
                {
                    type: "text",
                    text: title,
                    weight: "bold",
                    size: "xl",
                    color: "#ffffff",
                    wrap: true,
                    margin: "md",
                },
            ],
            backgroundColor: COLORS.dark,
            paddingAll: "20px",
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: "BRAIN MEMO",
                    weight: "bold",
                    size: "xxs",
                    color: COLORS.primary,
                    margin: "none",
                },
                {
                    type: "text",
                    text: summary,
                    size: "sm",
                    color: COLORS.text,
                    wrap: true,
                    margin: "md",
                    lineSpacing: "5px",
                },
            ],
            paddingAll: "20px",
        },
    };
}
/**
 * ✨ [ルーティン提案カード] を作成する関数
 * 「毎週日曜日に〇〇してますよね？」とAIが気づいた時に使います。
 */
function createRoutineSuggestionFlex(patterns) {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "✨", size: "sm" },
                        {
                            type: "text",
                            text: "ROUTINE FOUND",
                            color: "#ffffff",
                            weight: "bold",
                            size: "xxs",
                            margin: "sm",
                        },
                    ],
                    alignItems: "center",
                },
                {
                    type: "text",
                    text: "定例タスクの提案",
                    color: "#ffffff",
                    weight: "bold",
                    size: "md",
                    margin: "md",
                },
            ],
            backgroundColor: COLORS.info, // Sky color
            paddingAll: "20px",
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: "あなたの行動パターンから、以下のルーティンを見つけました。",
                    color: COLORS.text,
                    size: "xs",
                    wrap: true,
                },
                { type: "separator", margin: "md", color: "#f1f5f9" },
                {
                    type: "text",
                    text: patterns,
                    color: COLORS.dark,
                    size: "sm",
                    wrap: true,
                    margin: "md",
                    weight: "bold",
                    lineSpacing: "4px",
                },
            ],
            paddingAll: "20px",
        },
    };
}
// =========================================================
// [便利ツール] ヘルパー関数 (雑用係)
// =========================================================
/**
 * JSONクリーナー
 * AIはたまに「```json ... ```」のような余計な文字をつけて返してくるので、
 * データ部分だけを綺麗に取り出すための掃除機です。
 *
 * @param text - AIからの生の応答テキスト
 * @returns パース済みのJSONオブジェクト、またはエラー時はチャットオブジェクト
 */
function extractJson(text) {
    try {
        return JSON.parse(text); // そのまま読めたらラッキー
    }
    catch (e) {
        try {
            // 読めなかったら、余計な記号を削除して再トライ
            const cleaned = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            // {} で囲まれた部分を探す
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch)
                return JSON.parse(jsonMatch[0]);
            // どうしても無理なら普通のチャットとして扱う
            return { action: "CHAT", reply: text };
        }
        catch (e2) {
            return { action: "CHAT", reply: text };
        }
    }
}
/**
 * 日付フォーマッター
 * Googleカレンダーが理解できる厳密な日時形式(ISO 8601)に変換します。
 * 例: "2024-01-01 10:00" -> "2024-01-01T10:00:00+09:00"
 */
function formatIsoDate(dateStr) {
    if (!dateStr)
        return "";
    // すでにタイムゾーン情報が含まれていれば何もしない
    if (dateStr.includes("+") || dateStr.endsWith("Z"))
        return dateStr;
    // 秒がない場合 (YYYY-MM-DDTHH:mm) -> 秒とタイムゾーンを追加
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
        return `${dateStr}:00+09:00`;
    // 秒がある場合 (YYYY-MM-DDTHH:mm:ss) -> タイムゾーンを追加
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/))
        return `${dateStr}+09:00`;
    // 日付のみの場合 -> 00:00:00として扱う
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/))
        return `${dateStr}T00:00:00+09:00`;
    return dateStr;
}
// =========================================================
// [頭脳] AI・天気・カレンダーとの通信ロジック
// =========================================================
/**
 * AIモデルの確認
 * Googleのサーバーに問い合わせて、現在使えるAIモデル（Gemini）のリストを取得します。
 */
async function fetchAvailableModels(apiKey) {
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await axios_1.default.get(listUrl);
        return res.status === 200 ? res.data.models || [] : [];
    }
    catch (_a) {
        return [];
    }
}
/**
 * ベストなAIを選ぶ
 * 「Flash」という速くて安いモデルを優先し、だめなら「Pro」という賢いモデルを使います。
 * 冗長化（バックアップ）構成です。
 */
async function resolveGeminiModel(apiKey) {
    const models = await fetchAvailableModels(apiKey);
    // テキスト生成ができるモデルだけに絞る
    const genModels = models.filter((m) => { var _a; return (_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes("generateContent"); });
    // Flashモデルを探す
    let target = genModels.find((m) => m.name.includes("gemini-1.5-flash"));
    // なければProモデルを探す
    if (!target)
        target = genModels.find((m) => m.name.includes("gemini-1.5-pro"));
    // それもなければリストの最初を使う
    if (!target && genModels.length > 0)
        target = genModels[0];
    return target ? target.name.replace("models/", "") : "gemini-1.5-flash";
}
/**
 * AIにコンテンツ生成を依頼する関数（リトライ機能付き）
 * メインモデルが失敗したら、自動的にバックアップモデル（Gemini Pro）で再試行します。
 */
async function generateContentWithRetry(apiKey, promptParts, isJsonMode = false) {
    try {
        const modelName = await resolveGeminiModel(apiKey);
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const config = isJsonMode ? { responseMimeType: "application/json" } : {};
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: config,
        });
        const result = await model.generateContent(promptParts);
        return result.response.text();
    }
    catch (e) {
        console.error("AI Generation Error (Primary):", e);
        try {
            console.log("Retrying with gemini-pro...");
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(promptParts);
            return result.response.text();
        }
        catch (retryError) {
            throw new Error("AI processing failed completely: " + retryError.message);
        }
    }
}
/**
 * AIを呼び出してJSONデータをもらう
 * 内部でJSONパース処理まで行います。
 */
async function callGeminiJson(apiKey, prompt) {
    if (!apiKey)
        return { action: "CHAT", reply: "⚠️ APIキー未設定" };
    try {
        const text = await generateContentWithRetry(apiKey, [{ text: prompt }]);
        return extractJson(text);
    }
    catch (e) {
        // エラーメッセージを人間に優しくする
        return {
            action: "CHAT",
            reply: `💦 ちょっと考えすぎて疲れちゃいました...。もう一度お願いできますか？ (Error: ${e.message})`,
        };
    }
}
/**
 * AIを呼び出してプレーンテキストをもらう
 * 余計な記号を取り除いて返します。
 */
async function callGeminiText(apiKey, prompt) {
    if (!apiKey)
        return "";
    try {
        const text = await generateContentWithRetry(apiKey, [{ text: prompt }]);
        return text
            .replace(/^```.*\n/gm, "")
            .replace(/```/g, "")
            .trim();
    }
    catch (_a) {
        return "";
    }
}
/**
 * カレンダーの合言葉（トークン）を更新する
 * 1時間で切れる「通行証(Access Token)」が切れた時に、
 * 永続的な「合鍵(Refresh Token)」を使って新しい通行証を発行します。
 */
async function refreshAccessToken(refreshToken) {
    try {
        const res = await axios_1.default.post("https://oauth2.googleapis.com/token", {
            client_id: googleClientId.value(),
            client_secret: googleClientSecret.value(),
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        // 新しいアクセストークンを返す
        return res.data.access_token;
    }
    catch (_a) {
        return null;
    }
}
/**
 * 有効なカレンダーの鍵を取得する
 * データベースから鍵を取り出し、期限切れなら自動的に更新します。
 * これにより、ユーザーは再ログインの手間から解放されます。
 */
async function getValidAccessToken(uid) {
    try {
        // DBからユーザーのトークン情報を取得
        const docSnap = await db
            .collection("users")
            .doc(uid)
            .collection("system")
            .doc("tokens")
            .get();
        if (!docSnap.exists)
            return null;
        const data = docSnap.data();
        const accessToken = data === null || data === void 0 ? void 0 : data.accessToken;
        const refreshToken = data === null || data === void 0 ? void 0 : data.refreshToken; // これが重要！
        if (!accessToken)
            return null;
        // ★修正: まず今のトークンが使えるか軽くテストする
        // (カレンダーリスト取得APIを叩いてみる)
        try {
            await axios_1.default.get("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { maxResults: 1 }, // 最小限の通信量で済ませる
            });
            // エラーが出なければトークンは有効なのでそのまま返す
            return accessToken;
        }
        catch (e) {
            // 401 Unauthorized (期限切れ) ならリフレッシュを試みる
            if (e.response && e.response.status === 401 && refreshToken) {
                console.log(`User ${uid}: Token expired. Refreshing...`);
                // ここで合鍵を使って更新！
                const newToken = await refreshAccessToken(refreshToken);
                if (newToken) {
                    // 新しいトークンをDBに保存して次回以降も使えるようにする
                    await db
                        .collection("users")
                        .doc(uid)
                        .collection("system")
                        .doc("tokens")
                        .set({
                        accessToken: newToken,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }, { merge: true });
                    return newToken;
                }
            }
            return null;
        }
    }
    catch (_a) {
        return null;
    }
}
/**
 * 直近の予定を取得する
 * AIが「この時間は空いてるかな？」と確認するために使います。
 */
async function getCalendarEvents(uid) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return "（カレンダー未連携）";
        const now = new Date();
        // 前後48時間を取得して、移動時間なども考慮できるようにする
        const timeMin = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
        const res = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 30,
            },
        });
        const events = res.data.items || [];
        if (events.length === 0)
            return "直近の予定なし";
        // 予定リストを見やすい文字列に変換
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
            const loc = ev.location ? ` @ ${ev.location}` : "";
            return `・${start}: ${ev.summary}${loc}`;
        })
            .join("\n");
    }
    catch (_a) {
        return "（カレンダー取得失敗）";
    }
}
/**
 * カレンダーに新しい予定を書き込む
 */
async function addCalendarEvent(uid, eventData) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return false;
        // 日付フォーマットの厳密化
        const finalStart = formatIsoDate(eventData.start);
        if (!finalStart)
            return false;
        const finalEnd = eventData.end
            ? formatIsoDate(eventData.end)
            : new Date(new Date(finalStart).getTime() + 60 * 60000) // 終了時刻がなければ1時間後に設定
                .toISOString()
                .replace("Z", "+09:00");
        await axios_1.default.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            summary: eventData.title || "無題の予定",
            location: eventData.location || "",
            start: { dateTime: finalStart },
            end: { dateTime: finalEnd },
        }, { headers: { Authorization: `Bearer ${token}` } });
        return true;
    }
    catch (_a) {
        return false;
    }
}
/**
 * 天気予報チェック
 * 予定の場所と時間を見て、雨が降りそうか調べます。
 */
async function checkWeather(location, dateStr) {
    var _a;
    const apiKey = openWeatherApiKey.value();
    if (!apiKey)
        return null;
    try {
        const query = location || "Tokyo"; // 場所がなければ東京
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric&lang=ja`;
        const res = await axios_1.default.get(url);
        const forecasts = res.data.list || [];
        // 予定時刻に一番近い予報を探す
        const targetTime = new Date(dateStr).getTime();
        const closest = forecasts.reduce((prev, curr) => {
            return Math.abs(curr.dt * 1000 - targetTime) <
                Math.abs(prev.dt * 1000 - targetTime)
                ? curr
                : prev;
        });
        if (!closest)
            return null;
        // 雨判定ロジック
        const isRainy = closest.pop >= 0.5 || // 降水確率50%以上
            (closest.weather[0] && closest.weather[0].main === "Rain");
        if (isRainy) {
            const description = ((_a = closest.weather[0]) === null || _a === void 0 ? void 0 : _a.description) || "雨";
            const popPercent = Math.round(closest.pop * 100);
            return `予報は「${description}」(降水確率${popPercent}%) です。屋内プランも検討しますか？`;
        }
        return null;
    }
    catch (e) {
        return null;
    }
}
// --- 削除ロジック (安全版) ---
// カレンダー削除: タイトルで検索して削除
async function deleteCalendarEvent(uid, query) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return null;
        // まず検索
        const searchRes = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { q: query, maxResults: 5, singleEvents: true },
        });
        const events = searchRes.data.items || [];
        if (events.length === 0)
            return null;
        const target = events[0];
        // 特定したIDを使って削除
        await axios_1.default.delete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`, { headers: { Authorization: `Bearer ${token}` } });
        return target.summary;
    }
    catch (e) {
        console.error("Delete Calendar Error:", e);
        return null;
    }
}
// タスク削除: タイトルで検索して削除
async function deleteTodoByTitle(uid, title) {
    try {
        const ref = db.collection("todos");
        // 全件取得してからプログラム側で探す（Firestoreの部分一致検索が弱いため）
        const snap = await ref
            .where("userId", "==", uid)
            .where("isCompleted", "==", false)
            .get();
        // ★修正: 「勉強」だけでなく「勉強のタスク」など、キーワードが含まれる場合もヒットさせる（逆検索）
        const target = snap.docs.find((d) => {
            const dbTitle = d.data().title;
            return dbTitle.includes(title) || title.includes(dbTitle);
        });
        if (target) {
            await target.ref.delete();
            return target.data().title;
        }
        return null;
    }
    catch (e) {
        console.error("Delete Todo Error:", e);
        return null;
    }
}
// メモ削除: 内容で検索して削除
async function deleteMemoryByContent(uid, content) {
    try {
        const ref = db.collection("memories");
        const snap = await ref.where("userId", "==", uid).limit(50).get();
        // ★修正: 逆検索でヒット率を上げる
        const target = snap.docs.find((d) => {
            const dbText = d.data().text;
            return dbText.includes(content) || content.includes(dbText);
        });
        if (target) {
            await target.ref.delete();
            return target.data().text.substring(0, 20) + "...";
        }
        return null;
    }
    catch (e) {
        console.error("Delete Memory Error:", e);
        return null;
    }
}
// コンテキスト取得（過去のメモやチャット履歴）
async function getRecentMemories(uid, query) {
    try {
        const snap = await db
            .collection("memories")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
        if (snap.empty)
            return "（履歴なし）";
        return snap.docs
            .map((d) => `<<<${d.id}>>> ${d.data().text.replace(/\n/g, " ")}`)
            .join("\n");
    }
    catch (_a) {
        return "（メモ取得失敗）";
    }
}
// 現在の未完了タスク一覧を取得
async function getOpenTodos(uid) {
    try {
        const snap = await db
            .collection("todos")
            .where("userId", "==", uid)
            .where("isCompleted", "==", false)
            .limit(20) // 多めに取得
            .get();
        if (snap.empty)
            return "（未完了タスクなし）";
        // タイトル一覧を返す
        return snap.docs.map((d) => `・${d.data().title}`).join("\n");
    }
    catch (_a) {
        return "（タスク取得失敗）";
    }
}
async function getChatHistory(uid) {
    try {
        const snap = await db
            .collection("chat_logs")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(10)
            .get();
        return snap.docs
            .reverse()
            .map((d) => `User: ${d.data().question}\nAI: ${d.data().answer}`)
            .join("\n---\n");
    }
    catch (_a) {
        return "";
    }
}
// --- ★追加箇所: アクセストークンリフレッシュ用API ---
// これをフロントエンドから呼ぶことで、期限切れのトークンを更新します。
exports.refreshCalendarToken = (0, https_1.onCall)({
    secrets: [googleClientId, googleClientSecret],
    cors: true,
}, async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required");
    }
    const uid = req.auth.uid;
    // DBからリフレッシュトークンを取得
    const docSnap = await db
        .collection("users")
        .doc(uid)
        .collection("system")
        .doc("tokens")
        .get();
    if (!docSnap.exists) {
        throw new https_1.HttpsError("not-found", "No tokens found");
    }
    const data = docSnap.data();
    const refreshToken = data === null || data === void 0 ? void 0 : data.refreshToken;
    if (!refreshToken) {
        throw new https_1.HttpsError("failed-precondition", "No refresh token available");
    }
    // 定義済みの refreshAccessToken 関数を使って更新
    // (内部でGoogleのOAuthエンドポイントを叩く)
    const newToken = await refreshAccessToken(refreshToken);
    if (!newToken) {
        throw new https_1.HttpsError("internal", "Failed to refresh token from Google");
    }
    // 新しいトークンをDBに保存（次回以降も使えるように）
    await db
        .collection("users")
        .doc(uid)
        .collection("system")
        .doc("tokens")
        .set({
        accessToken: newToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // 新しいトークンを返す
    return { accessToken: newToken };
});
// =========================================================
// 5. メイン処理: LINE Webhook
// [司令塔] LINEからのメッセージを受け取る一番大事な場所
// =========================================================
exports.lineWebhook = (0, https_1.onRequest)({
    secrets: [
        lineBotToken,
        lineBotSecret,
        geminiApiKey,
        googleClientId,
        googleClientSecret,
        openWeatherApiKey,
    ],
    cors: true,
}, async (req, res) => {
    // 1. 必要な鍵のチェック
    const token = lineBotToken.value();
    const apiKey = geminiApiKey.value();
    if (!token || !apiKey) {
        res.status(500).send("Config Error");
        return;
    }
    const client = new line.Client({ channelAccessToken: token });
    const events = req.body.events;
    // 2. 受け取ったイベントを順に処理
    // エラーで全体が止まらないように安全装置(try-catch)で囲む
    try {
        await Promise.all(events.map(async (event) => {
            var _a, _b, _c;
            // テキストメッセージ以外は無視
            if (event.type !== "message" || event.message.type !== "text")
                return;
            const eventId = event.webhookEventId;
            const lineUserId = event.source.userId;
            const message = event.message.text.trim();
            // 重複実行防止: 同じメッセージIDが既に処理済みならスキップ
            try {
                await db.collection("processed_events").doc(eventId).create({
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    userId: lineUserId,
                });
            }
            catch (_d) {
                return;
            }
            // 3. ユーザーの特定 (LINE IDからアプリのUser IDを探す)
            const usersSnap = await db
                .collection("users")
                .where("lineUserId", "==", lineUserId)
                .limit(1)
                .get();
            if (usersSnap.empty) {
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "アプリで「LINE連携」ボタンを押してください。",
                });
                return;
            }
            const uid = usersSnap.docs[0].id;
            const userRef = db.collection("users").doc(uid);
            // 4. 固定コマンドの処理 (モード切替)
            const commands = {
                "【モード】タスク": "TASK",
                "【モード】メモ": "MEMORY",
                "【モード】カレンダー": "CALENDAR",
                "【モード】お任せ": "AUTO",
                "【モード】リセット": "AUTO",
            };
            if (commands[message]) {
                await userRef.update({ lineMode: commands[message] });
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: `✅ ${commands[message]}モードになりました。`,
                });
                return;
            }
            // 5. 状況(コンテキスト)の収集
            // AIに判断材料を与えるために、色々なデータを集めます
            const [contextSnap, memoryContext, chatHistory, calendarEvents, openTodos,] = await Promise.all([
                userRef.collection("system").doc("user_context").get(),
                getRecentMemories(uid, message),
                getChatHistory(uid),
                getCalendarEvents(uid),
                getOpenTodos(uid),
            ]);
            const lastMemoryId = ((_a = contextSnap.data()) === null || _a === void 0 ? void 0 : _a.lastMemoryId) || null;
            // 時間帯による感情設定
            const now = new Date();
            const nowStr = now.toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            });
            const currentHour = parseInt(nowStr.split(" ")[1].split(":")[0], 10);
            const dayOfWeek = now.getDay();
            let emotionPrompt = "";
            if (currentHour >= 2 && currentHour <= 5) {
                emotionPrompt =
                    "現在は深夜です。優しく静かなトーンで。「夜更かしですね」などの言葉を添えて。";
            }
            else if (dayOfWeek === 5 && currentHour >= 18) {
                emotionPrompt =
                    "現在は金曜日の夜です。一週間の疲れを労ってください。「一週間お疲れ様でした！」など。";
            }
            else if (currentHour >= 6 && currentHour <= 9) {
                emotionPrompt =
                    "現在は早朝です。爽やかで元気なトーンで接してください。";
            }
            // 6. AIへの指令書 (プロンプト) 作成
            // ★修正: 返信のフォーマットに関する指示を厳格化
            const routerPrompt = `
      あなたはユーザーの「専属パートナーAI」です。現在日時: ${nowStr}
      
      【会話履歴】
      ${chatHistory}

      【カレンダー】
      ${calendarEvents}
      
      【現在の未完了タスク】
      ${openTodos}
      
      【最近のメモ】
      ${memoryContext}
      
      【ユーザー入力】
      "${message}"

      【指示】
      1. ユーザーの意図を汲み取り、JSON形式でアクションを出力してください。
      2. **返信の口調・フォーマット（厳守）**:
         - ユーザーの口調に合わせ、${emotionPrompt}
         - 「承知いたしました」等の定型句は禁止。人間味のある反応をしてください。
         - **改行と箇条書きを積極的に使い、見やすく整形してください。**
         - **重要な情報は【 】や■などの記号を使って目立たせてください。**
         - 例:
           「了解です！👍
            
            📅 **予定を登録**
            ・日時: 2/25 10:00~
            ・内容: 会議
            
            あと、昨日のメモにも関連情報があったので確認しておいてね！」

      3. **削除アクション (重要)**: 
         - ユーザーが「〇〇を削除」「消して」と言ったら、言い訳せず必ず削除アクションを選んでください。
         - メモ削除: "MEMORY_DELETE"
         - タスク削除: "TASK_DELETE"
         - 予定削除: "CALENDAR_DELETE"
         - キーワードは、文章全体ではなく「対象の名詞（例: '勉強'）」だけを抽出してください。

      出力JSON:
      {
        "action": "CALENDAR_ADD" | "CALENDAR_DELETE" | "CALENDAR_CONFLICT_RESOLVE" | "CALENDAR_CONFLICT_ERROR" | "TRAVEL_TIME_WARNING" | "TASK_ADD" | "TASK_DELETE" | "MEMORY_ADD" | "MEMORY_APPEND" | "MEMORY_EDIT" | "MEMORY_DELETE" | "CHAT",
        "data": { 
          "title": "予定名/タスク名", 
          "location": "場所", 
          "start": "YYYY-MM-DDTHH:mm", 
          "end": "YYYY-MM-DDTHH:mm", 
          "content": "メモ内容/削除キーワード", 
          "isOutdoor": boolean,
          "targetId": "ID", 
          "instruction": "編集指示",
          "suggestion": "提案メッセージ"
        },
        "reply": "パートナーとしての人間味ある返信（改行・絵文字必須）"
      }
      `;
            // 7. AIに判断させる
            const aiDecision = await callGeminiJson(apiKey, routerPrompt);
            const action = aiDecision.action || "CHAT";
            const data = aiDecision.data || {};
            let replyText = aiDecision.reply || "処理しました。";
            let flexMessage = null;
            let newLastMemoryId = null;
            // 8. アクションの実行
            if (action === "CALENDAR_CONFLICT_ERROR") {
                replyText = "おっと、その時間は予定が被っちゃってますね。";
                flexMessage = createAlertFlex("ダブルブッキング警告", `その時間は「${data.content || "別の予定"}」が入っています。`, data.suggestion || "時間を変更してください。");
            }
            else if (action === "CALENDAR_CONFLICT_RESOLVE") {
                flexMessage = createAlertFlex("スケジュール調整", `「${data.title}」を入れたいですが、既存の予定と重なります。`, data.suggestion || "既存の予定をずらしますか？");
            }
            else if (action === "TRAVEL_TIME_WARNING") {
                flexMessage = createAlertFlex("移動時間アラート", `前後の予定との間隔が短すぎます。\n${data.suggestion}`, "移動時間を確保して登録しますか？");
            }
            else if (action === "CALENDAR_ADD") {
                const success = await addCalendarEvent(uid, {
                    title: data.title,
                    location: data.location,
                    start: data.start,
                    end: data.end,
                });
                if (success) {
                    let weatherWarning = "";
                    if (data.isOutdoor) {
                        const warning = await checkWeather(data.location, data.start);
                        if (warning) {
                            weatherWarning = warning;
                            replyText += `\n(あ、当日は雨っぽいので気をつけて☔)`;
                        }
                    }
                    flexMessage = createCalendarFlex(data.title, data.start, data.end, data.location, weatherWarning);
                    // 通知履歴に保存
                    await db.collection("notifications").add({
                        userId: uid,
                        type: "reservation",
                        title: "予定追加",
                        message: `「${data.title}」を登録しました`,
                        isRead: false,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                else {
                    replyText += "\n(ごめん、カレンダー登録に失敗しちゃった...)";
                }
            }
            else if (action === "MEMORY_EDIT" &&
                data.targetId &&
                data.instruction) {
                // メモ編集
                try {
                    const docRef = db.collection("memories").doc(data.targetId);
                    const docSnap = await docRef.get();
                    if (docSnap.exists) {
                        const newText = await callGeminiText(apiKey, `修正指示:${data.instruction}\n元文:${(_b = docSnap.data()) === null || _b === void 0 ? void 0 : _b.text}`);
                        if (newText) {
                            await docRef.update({ text: newText.trim() });
                            flexMessage = createMemoryFlex(newText.trim(), true);
                            newLastMemoryId = data.targetId;
                        }
                    }
                }
                catch (_e) {
                    replyText = "更新に失敗しました...";
                }
            }
            else if (action === "MEMORY_APPEND" &&
                (data.targetId || lastMemoryId)) {
                // メモ追記
                try {
                    const finalId = data.targetId || lastMemoryId;
                    const docRef = db.collection("memories").doc(finalId);
                    const docSnap = await docRef.get();
                    if (docSnap.exists) {
                        const newText = `${(_c = docSnap.data()) === null || _c === void 0 ? void 0 : _c.text}\n${data.content || message}`;
                        await docRef.update({ text: newText });
                        flexMessage = createMemoryFlex(newText, true);
                        newLastMemoryId = finalId;
                    }
                }
                catch (_f) {
                    replyText = "追記に失敗しました...";
                }
            }
            else if (action === "TASK_DELETE") {
                const deletedTitle = await deleteTodoByTitle(uid, data.title || message);
                replyText = deletedTitle
                    ? `✅ タスク「${deletedTitle}」を削除しました。`
                    : "そのタスク、見当たりませんでした...。";
            }
            else if (action === "CALENDAR_DELETE") {
                const deletedTitle = await deleteCalendarEvent(uid, data.title || message);
                if (deletedTitle) {
                    replyText = `🗑️ 予定「${deletedTitle}」を削除しました👍`;
                    await db.collection("notifications").add({
                        userId: uid,
                        type: "cancel",
                        title: "予定削除",
                        message: `「${deletedTitle}」を削除しました`,
                        isRead: false,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                else {
                    replyText = "その予定が見つかりません。もう一度確認してみて？";
                }
            }
            else if (action === "MEMORY_DELETE") {
                const deletedContent = await deleteMemoryByContent(uid, data.content || message);
                replyText = deletedContent
                    ? `🗑️ メモ「${deletedContent}」を削除しました。`
                    : "そのメモが見つかりませんでした...。";
            }
            else if (action === "TASK_ADD") {
                const title = data.content || data.title || message;
                await db.collection("todos").add({
                    userId: uid,
                    title,
                    isCompleted: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: "LINE",
                });
                flexMessage = createTaskFlex(title);
            }
            else if (action === "MEMORY_ADD") {
                const content = data.content || message;
                const docRef = await db.collection("memories").add({
                    userId: uid,
                    text: content,
                    aiSummary: content.slice(0, 20),
                    tags: ["LINE"],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    source: "LINE",
                });
                flexMessage = createMemoryFlex(content);
                newLastMemoryId = docRef.id;
            }
            if (newLastMemoryId)
                await userRef
                    .collection("system")
                    .doc("user_context")
                    .set({ lastMemoryId: newLastMemoryId }, { merge: true });
            // チャット履歴をDBに保存
            await db.collection("chat_logs").add({
                userId: uid,
                question: message,
                answer: replyText,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // LINEへ返信
            const messages = [
                { type: "text", text: replyText.trim() },
            ];
            if (flexMessage)
                messages.push({
                    type: "flex",
                    altText: "AIからのメッセージ",
                    contents: flexMessage,
                });
            await client.replyMessage(event.replyToken, messages);
        }));
    }
    catch (e) {
        console.error("Webhook Error:", e);
    }
    res.json({ success: true });
});
// =========================================================
// 6. 定期実行機能 (バックグラウンド処理)
// =========================================================
/**
 * [直前通知] 15分ごとに予定をチェックして通知
 */
exports.checkUpcomingMeetings = (0, scheduler_1.onSchedule)({
    schedule: "every 15 minutes",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
}, async (event) => {
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const users = await db.collection("users").get();
    for (const user of users.docs) {
        const d = user.data();
        if (!d.lineUserId)
            continue; // LINE連携していない人はスキップ
        const token = await getValidAccessToken(user.id);
        if (!token) {
            console.log(`User ${user.id}: Token invalid`);
            continue;
        }
        try {
            const now = new Date();
            // 直近20分以内の予定を探す
            const res = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    timeMin: now.toISOString(),
                    timeMax: new Date(now.getTime() + 20 * 60000).toISOString(),
                    singleEvents: true,
                    orderBy: "startTime",
                },
            });
            for (const ev of res.data.items || []) {
                if (!ev.summary)
                    continue;
                // 過去のメモを探す
                const mems = await db
                    .collection("memories")
                    .where("userId", "==", user.id)
                    .orderBy("createdAt", "desc")
                    .limit(30)
                    .get();
                const dump = mems.docs
                    .map((x) => `[${x.data().createdAt.toDate().toLocaleDateString()}] ${x.data().text}`)
                    .join("\n");
                const txt = await callGeminiText(apiKey, `「${ev.summary}」がもうすぐ始まります。過去メモ:${dump}。もし関連情報があれば要約し、なければ「頑張ってください」等の応援メッセージを作成してください(100字以内)。`);
                // 通知送信
                await client.pushMessage(d.lineUserId, {
                    type: "flex",
                    altText: `開始: ${ev.summary}`,
                    contents: createCheatSheetFlex(ev.summary, txt),
                });
                console.log(`Notification sent to ${user.id} for ${ev.summary}`);
            }
        }
        catch (e) {
            console.error(`CheckMeeting Error ${user.id}:`, e);
        }
    }
});
// [ルーティン提案] 毎週日曜夜に実行
exports.checkRoutinePatterns = (0, scheduler_1.onSchedule)({
    schedule: "0 20 * * 0",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
}, async (event) => {
    // ... (省略可能ですが一応全部出力します) ...
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const users = await db.collection("users").get();
    for (const user of users.docs) {
        const d = user.data();
        if (!d.lineUserId)
            continue;
        const pastMonth = new Date();
        pastMonth.setDate(pastMonth.getDate() - 30);
        const [mems, todos] = await Promise.all([
            db
                .collection("memories")
                .where("userId", "==", user.id)
                .where("createdAt", ">=", pastMonth)
                .get(),
            db
                .collection("todos")
                .where("userId", "==", user.id)
                .where("createdAt", ">=", pastMonth)
                .get(),
        ]);
        if (mems.empty && todos.empty)
            continue;
        const historyText = [
            ...mems.docs.map((x) => `メモ: ${x.data().text} (${x.data().createdAt.toDate().getDay()}曜日)`),
            ...todos.docs.map((x) => `タスク: ${x.data().title} (${x.data().createdAt.toDate().getDay()}曜日)`),
        ].join("\n");
        const prompt = `
      以下の過去1ヶ月の行動ログから、「特定の曜日に繰り返されている行動（ルーティン）」を見つけてください。
      もしあれば、「毎週〇曜日に〇〇していますね。定期登録しましょうか？」と提案してください。なければ「なし」。
      ログ: ${historyText}
    `;
        const suggestion = await callGeminiText(apiKey, prompt);
        if (!suggestion.includes("なし") && suggestion.length > 5) {
            await client.pushMessage(d.lineUserId, {
                type: "text",
                text: `【定期パターンの発見】\n\n${suggestion}`,
            });
        }
    }
});
// [毎朝のブリーフィング] 毎日7時に実行
exports.sendMorningBriefing = (0, scheduler_1.onSchedule)({
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
}, async (event) => {
    const users = await db.collection("users").get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    for (const user of users.docs) {
        const d = user.data();
        if (!d.lineUserId)
            continue;
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        const [mems, todos] = await Promise.all([
            db
                .collection("memories")
                .where("userId", "==", user.id)
                .where("createdAt", ">=", yest)
                .orderBy("createdAt", "desc")
                .get(),
            db
                .collection("todos")
                .where("userId", "==", user.id)
                .where("isCompleted", "==", false)
                .get(),
        ]);
        if (mems.empty && todos.empty)
            continue;
        const mTxt = mems.docs.map((d) => `- ${d.data().text}`).join("\n");
        const tTxt = todos.docs.map((d) => `- [未] ${d.data().title}`).join("\n");
        const prompt = `おはよう。昨日:${mTxt}\n残タスク:${tTxt}\n元気に300字でブリーフィングして。`;
        const txt = await callGeminiText(apiKey, prompt);
        await client.pushMessage(d.lineUserId, { type: "text", text: txt });
    }
});
// --- 連携用API (変更なし) ---
// LINE連携時の処理
exports.linkLineAccount = (0, https_1.onCall)({
    secrets: [
        lineLoginChannelId,
        lineLoginChannelSecret,
        lineBotToken,
        lineBotSecret,
    ],
}, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { code, redirectUri } = req.data;
    try {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);
        params.append("client_id", lineLoginChannelId.value());
        params.append("client_secret", lineLoginChannelSecret.value());
        const tRes = await axios_1.default.post("https://api.line.me/oauth2/v2.1/token", params);
        const pRes = await axios_1.default.get("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${tRes.data.access_token}` },
        });
        await db
            .collection("users")
            .doc(req.auth.uid)
            .set({ isLineLinked: true, lineUserId: pRes.data.userId }, { merge: true });
        return { success: true };
    }
    catch (e) {
        throw new https_1.HttpsError("internal", e.message);
    }
});
// LINE連携解除
exports.unlinkLineAccount = (0, https_1.onCall)({ cors: true }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    await db
        .collection("users")
        .doc(req.auth.uid)
        .set({ isLineLinked: false, lineUserId: admin.firestore.FieldValue.delete() }, { merge: true });
    return { success: true };
});
// URL読み取り(予備)
exports.scrapeUrl = (0, https_1.onCall)(async () => ({ success: true }));
// 通知テスト用API
exports.forceTriggerNotification = (0, https_1.onCall)({
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
    cors: true,
}, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const uid = req.auth.uid;
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const user = await db.collection("users").doc(uid).get();
    const d = user.data();
    if (!d || !d.lineUserId)
        return { result: "LINE未連携" };
    const token = req.data.accessToken || (await getValidAccessToken(uid));
    if (!token)
        return { result: "カレンダー再ログイン必要" };
    try {
        const now = new Date();
        const res = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                timeMin: now.toISOString(),
                timeMax: new Date(now.getTime() + 24 * 3600000).toISOString(),
                singleEvents: true,
                orderBy: "startTime",
                maxResults: 1,
            },
        });
        const ev = (res.data.items || [])[0];
        const title = ev ? ev.summary : "（予定なし）";
        const mems = await db
            .collection("memories")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(30)
            .get();
        const dump = mems.docs
            .map((x) => `[${x.data().createdAt.toDate().toLocaleDateString()}] ${x.data().text}`)
            .join("\n");
        const txt = await callGeminiText(apiKey, `「${title}」のカンペ作成(150字)。挨拶から始めて。AIの独り言禁止。`);
        await client.pushMessage(d.lineUserId, {
            type: "flex",
            altText: "テスト通知",
            contents: createCheatSheetFlex(title, txt),
        });
        return { result: "送信成功" };
    }
    catch (e) {
        return { result: `エラー: ${e.message}` };
    }
});
