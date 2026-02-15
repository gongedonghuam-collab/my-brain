"use strict";
// ==============================================================================
//  My Brain (AI秘書) バックエンドプログラム 【コピーボタン搭載・UX完全版】
//  - 修正: Flex Messageに「📝 テキストを表示」ボタンを追加（Postback実装）
//  - 修正: Postbackイベントを検知し、元のテキストを返信するロジックを追加
//  - 維持: URL追撃機能、リマインダー、カレンダー通知など全機能
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
exports.sendWeeklyRoutineSuggestion = exports.redeemInviteCode = exports.checkReminders = exports.sendMorningBriefing = exports.checkUpcomingMeetings = exports.lineWebhook = exports.refreshCalendarToken = exports.linkLineAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
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
    timeoutSeconds: 300,
});
// --- Secrets ---
const lineBotToken = (0, params_1.defineSecret)("LINE_BOT_TOKEN");
const lineBotSecret = (0, params_1.defineSecret)("LINE_BOT_SECRET");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const googleClientId = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleClientSecret = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const lineLoginChannelId = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_ID");
const lineLoginChannelSecret = (0, params_1.defineSecret)("LINE_LOGIN_CHANNEL_SECRET");
const openWeatherApiKey = (0, params_1.defineSecret)("OPENWEATHER_API_KEY");
// --- Constants ---
const COLORS = {
    primary: "#6366f1",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#0ea5e9",
    dark: "#1e293b",
    text: "#334155",
    textWhite: "#f8fafc",
    textLight: "#94a3b8",
};
/**
 * WeatherAPI Emoji Helper
 */
function getWeatherEmoji(code) {
    if (code === 1000)
        return "☀️";
    if ([1003, 1006, 1009].includes(code))
        return "☁️";
    if ([1030, 1135, 1147].includes(code))
        return "🌫️";
    if ([
        1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246,
    ].includes(code))
        return "☔";
    if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code))
        return "⛄";
    if ([1087, 1273, 1276, 1279, 1282].includes(code))
        return "⚡";
    return "🌧️";
}
// --- Helpers: Date & JSON ---
function normalizeToJstIso(dateStr) {
    if (!dateStr)
        return new Date().toISOString();
    let cleaned = dateStr.trim().replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned))
        return cleaned;
    if (cleaned.includes("T") &&
        !cleaned.includes("+") &&
        !cleaned.endsWith("Z")) {
        if (/T\d{2}:\d{2}$/.test(cleaned))
            return `${cleaned}:00+09:00`;
        return `${cleaned}+09:00`;
    }
    return cleaned;
}
function formatJstTime(isoString) {
    if (!isoString)
        return { dateStr: "--/--", timeStr: "--:--", weekDay: "", isAllDay: false };
    try {
        const safeIso = normalizeToJstIso(isoString);
        if (safeIso.length === 10 && safeIso.includes("-")) {
            const d = new Date(safeIso);
            if (isNaN(d.getTime()))
                throw new Error("Invalid Date");
            const dateStr = d.toLocaleDateString("ja-JP", {
                month: "numeric",
                day: "numeric",
            });
            const weekDayJA = d.toLocaleDateString("ja-JP", { weekday: "short" });
            const weekDayMap = {
                日: "日",
                月: "月",
                火: "火",
                水: "水",
                木: "木",
                金: "金",
                土: "土",
            };
            return {
                dateStr,
                timeStr: "終日",
                weekDay: weekDayMap[weekDayJA] || weekDayJA,
                isAllDay: true,
            };
        }
        const date = new Date(safeIso);
        if (isNaN(date.getTime()))
            throw new Error("Invalid Date");
        const dateStr = date.toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
            month: "numeric",
            day: "numeric",
        });
        const timeStr = date.toLocaleTimeString("ja-JP", {
            timeZone: "Asia/Tokyo",
            hour: "numeric",
            minute: "2-digit",
            hour12: false,
        });
        const weekDayJA = date.toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
            weekday: "short",
        });
        const weekDayMap = {
            日: "日",
            月: "月",
            火: "火",
            水: "水",
            木: "木",
            金: "金",
            土: "土",
        };
        return {
            dateStr,
            timeStr,
            weekDay: weekDayMap[weekDayJA] || weekDayJA,
            isAllDay: false,
        };
    }
    catch (e) {
        console.error(`Date Parse Error: ${isoString}`, e);
        return {
            dateStr: "??/??",
            timeStr: "--:--",
            weekDay: "-",
            isAllDay: false,
        };
    }
}
function extractJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (e) {
        try {
            let cleaned = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch)
                return JSON.parse(jsonMatch[0]);
            return { action: "CHAT", reply: text };
        }
        catch (e2) {
            return { action: "CHAT", reply: text };
        }
    }
}
function formatIsoDate(dateStr) {
    return normalizeToJstIso(dateStr);
}
// ==============================================================================
//  Flex Message Creators
// ==============================================================================
function createReauthFlex() {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: COLORS.danger,
            paddingAll: "12px",
            contents: [
                {
                    type: "text",
                    text: "⚠️ 連携切れ",
                    color: "#ffffff",
                    weight: "bold",
                    size: "sm",
                },
            ],
        },
        body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            contents: [
                {
                    type: "text",
                    text: "Googleカレンダーへのアクセス権限が切れました。",
                    wrap: true,
                    size: "sm",
                    color: COLORS.text,
                    margin: "md",
                },
                {
                    type: "text",
                    text: "以下のボタンから再接続してください。",
                    wrap: true,
                    size: "xs",
                    color: COLORS.textLight,
                    margin: "sm",
                },
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "🔄 今すぐ再接続する",
                        uri: "https://my-brain-145b1.web.app/app?reconnect=true&openExternalBrowser=1",
                    },
                    style: "primary",
                    color: COLORS.primary,
                    margin: "lg",
                },
            ],
        },
    };
}
function createReminderFlex(title, start, end, location, weatherInfo, weatherIcon = "🌤️", headerText = "まもなく開始") {
    const { timeStr, isAllDay } = formatJstTime(start);
    const displayTime = isAllDay ? "終日" : `${timeStr} ~`;
    const icon = headerText.includes("明日") ? "📅" : "⏰";
    const bodyContents = [
        {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: icon, size: "xl", flex: 0, margin: "sm" },
                {
                    type: "text",
                    text: headerText,
                    weight: "bold",
                    size: "md",
                    color: COLORS.text,
                    margin: "md",
                    gravity: "center",
                },
            ],
        },
        { type: "separator", margin: "lg", color: "#f1f5f9" },
        {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: [
                {
                    type: "text",
                    text: displayTime,
                    size: "3xl",
                    weight: "bold",
                    color: COLORS.primary,
                    margin: "md",
                },
                {
                    type: "text",
                    text: title,
                    size: "lg",
                    weight: "bold",
                    color: COLORS.text,
                    wrap: true,
                    margin: "sm",
                },
                location
                    ? {
                        type: "box",
                        layout: "horizontal",
                        margin: "sm",
                        contents: [
                            { type: "text", text: "📍", size: "xs", flex: 0 },
                            {
                                type: "text",
                                text: location,
                                size: "xs",
                                color: COLORS.textLight,
                                margin: "sm",
                                wrap: true,
                            },
                        ],
                    }
                    : { type: "spacer", size: "xs" },
            ],
        },
    ];
    if (weatherInfo) {
        bodyContents.push({
            type: "box",
            layout: "vertical",
            margin: "lg",
            contents: [
                { type: "separator", margin: "md", color: "#f1f5f9" },
                {
                    type: "box",
                    layout: "horizontal",
                    margin: "md",
                    alignItems: "center",
                    contents: [
                        {
                            type: "text",
                            text: weatherIcon,
                            size: "3xl",
                            flex: 0,
                            margin: "md",
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "md",
                            flex: 1,
                            contents: [
                                {
                                    type: "text",
                                    text: "天気予報",
                                    size: "xxs",
                                    color: COLORS.info,
                                    weight: "bold",
                                },
                                {
                                    type: "text",
                                    text: weatherInfo,
                                    size: "xs",
                                    color: COLORS.text,
                                    wrap: true,
                                    maxLines: 2,
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    }
    const footerContents = [];
    if (location && location.trim() !== "") {
        footerContents.push({
            type: "button",
            style: "primary",
            height: "sm",
            color: COLORS.info,
            action: {
                type: "uri",
                label: "📍 ルートを調べる",
                uri: `https://www.google.com/maps?q=${encodeURIComponent(location)}`,
            },
        });
    }
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "vertical",
            contents: bodyContents,
            paddingAll: "20px",
            backgroundColor: "#ffffff",
            cornerRadius: "xl",
            borderColor: COLORS.primary,
            borderWidth: "normal",
        },
        footer: footerContents.length > 0
            ? {
                type: "box",
                layout: "vertical",
                contents: footerContents,
                paddingAll: "20px",
            }
            : undefined,
    };
}
// ★修正: URL検知＆「テキスト表示」ボタン追加版 ChatFlex
// logIdを受け取り、ボタンに埋め込む
function createChatFlex(text, logId) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);
    const footerContents = [];
    // URLがあれば「リンクを開く」ボタンを追加 (最大3つ)
    if (urls) {
        urls.forEach((url, index) => {
            if (index < 3) {
                footerContents.push({
                    type: "button",
                    style: "secondary",
                    height: "sm",
                    margin: index === 0 ? "none" : "sm",
                    action: {
                        type: "uri",
                        label: urls.length === 1 ? "🌐 リンクを開く" : `🌐 リンク ${index + 1}`,
                        uri: url,
                    },
                });
            }
        });
    }
    // ★追加: コピー用のテキスト表示ボタン
    if (logId) {
        footerContents.push({
            type: "button",
            style: "secondary",
            height: "sm",
            color: COLORS.textWhite,
            margin: footerContents.length > 0 ? "sm" : "none",
            action: {
                type: "postback",
                label: "📝 テキストを表示",
                data: `action=copy&id=${logId}`,
            },
        });
    }
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    margin: "none",
                    contents: [
                        {
                            type: "text",
                            text: "🧠 My Brain",
                            weight: "bold",
                            size: "xxs",
                            color: COLORS.primary,
                            flex: 1,
                        },
                        {
                            type: "text",
                            text: "AI Answer",
                            weight: "bold",
                            size: "xxs",
                            color: "#cbd5e1",
                            align: "end",
                        },
                    ],
                },
                { type: "separator", margin: "sm", color: "#f1f5f9" },
                {
                    type: "text",
                    text: text,
                    size: "sm",
                    color: COLORS.text,
                    wrap: true,
                    margin: "md",
                    lineSpacing: "5px",
                },
            ],
            backgroundColor: "#ffffff",
            cornerRadius: "xl",
            borderColor: "#e2e8f0",
            borderWidth: "light",
        },
        footer: footerContents.length > 0
            ? {
                type: "box",
                layout: "vertical",
                contents: footerContents,
                paddingAll: "10px",
                backgroundColor: "#f8fafc",
            }
            : undefined,
    };
}
function createCalendarFlex(title, start, end, location, weatherInfo, weatherIcon = "🌤️") {
    const { dateStr, timeStr, weekDay, isAllDay } = formatJstTime(start);
    const displayTime = isAllDay ? "終日" : `${timeStr} ~`;
    const bodyContents = [
        {
            type: "text",
            text: `${dateStr} (${weekDay})`,
            size: "xxl",
            weight: "bold",
            color: COLORS.text,
            margin: "md",
        },
        {
            type: "text",
            text: displayTime,
            size: "xl",
            weight: "bold",
            color: COLORS.primary,
            margin: "sm",
        },
        { type: "separator", margin: "lg", color: "#f1f5f9" },
        {
            type: "box",
            layout: "vertical",
            margin: "lg",
            contents: [
                {
                    type: "text",
                    text: title,
                    size: "lg",
                    weight: "bold",
                    color: COLORS.text,
                    wrap: true,
                },
                location
                    ? {
                        type: "box",
                        layout: "horizontal",
                        margin: "sm",
                        contents: [
                            { type: "text", text: "📍", size: "xs", flex: 0 },
                            {
                                type: "text",
                                text: location,
                                size: "xs",
                                color: COLORS.textLight,
                                margin: "sm",
                                wrap: true,
                            },
                        ],
                    }
                    : { type: "spacer", size: "xs" },
            ],
        },
    ];
    if (weatherInfo) {
        bodyContents.push({
            type: "box",
            layout: "vertical",
            margin: "lg",
            contents: [
                { type: "separator", margin: "md", color: "#f1f5f9" },
                {
                    type: "box",
                    layout: "horizontal",
                    margin: "md",
                    alignItems: "center",
                    contents: [
                        {
                            type: "text",
                            text: weatherIcon,
                            size: "3xl",
                            flex: 0,
                            margin: "md",
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "md",
                            flex: 1,
                            contents: [
                                {
                                    type: "text",
                                    text: "天気予報",
                                    size: "xxs",
                                    color: COLORS.info,
                                    weight: "bold",
                                },
                                {
                                    type: "text",
                                    text: weatherInfo,
                                    size: "xs",
                                    color: COLORS.text,
                                    wrap: true,
                                    maxLines: 2,
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    }
    const footerContents = [];
    if (location && location.trim() !== "") {
        footerContents.push({
            type: "button",
            style: "primary",
            color: COLORS.info,
            height: "sm",
            margin: "sm",
            action: {
                type: "uri",
                label: "📍 ルートを調べる",
                uri: `https://www.google.com/maps?q=${encodeURIComponent(location)}`,
            },
        });
    }
    footerContents.push({
        type: "button",
        style: "secondary",
        height: "sm",
        margin: "sm",
        action: {
            type: "uri",
            label: "Googleカレンダーを開く",
            uri: "https://calendar.google.com/",
        },
    });
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: COLORS.primary,
            paddingAll: "20px",
            contents: [
                {
                    type: "text",
                    text: "登録完了",
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
            contents: footerContents,
            paddingAll: "20px",
            spacing: "md",
        },
    };
}
function createTaskFlex(title) {
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "horizontal",
            paddingAll: "20px",
            backgroundColor: "#f0fdf4",
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
                    margin: "md",
                    contents: [
                        {
                            type: "text",
                            text: "タスク追加",
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
                },
            ],
        },
    };
}
function createMemoryFlex(text, isUpdate = false) {
    return {
        type: "bubble",
        size: "mega",
        body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            backgroundColor: "#fffbeb",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        {
                            type: "text",
                            text: isUpdate ? "📝 メモ更新" : "🧠 メモ保存",
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
        },
    };
}
function createRoutineSuggestionFlex(patterns) {
    return {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            backgroundColor: COLORS.info,
            paddingAll: "20px",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    alignItems: "center",
                    contents: [
                        { type: "text", text: "✨", size: "sm" },
                        {
                            type: "text",
                            text: "ルーティン提案",
                            color: "#ffffff",
                            weight: "bold",
                            size: "xxs",
                            margin: "sm",
                        },
                    ],
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
        },
        body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
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
        },
    };
}
// --- AI Model Management ---
async function fetchAvailableModels(apiKey) {
    try {
        const res = await axios_1.default.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        return res.status === 200 ? res.data.models || [] : [];
    }
    catch (e) {
        return [];
    }
}
async function resolveGeminiModel(apiKey) {
    const models = await fetchAvailableModels(apiKey);
    const genModels = models.filter((m) => { var _a; return (_a = m.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes("generateContent"); });
    let target = genModels.find((m) => m.name.includes("gemini-1.5-flash-001"));
    if (!target)
        target = genModels.find((m) => m.name.includes("gemini-1.5-flash"));
    if (!target)
        target = genModels.find((m) => m.name.includes("gemini-1.5-pro"));
    if (!target && genModels.length > 0)
        target = genModels[0];
    const finalName = target
        ? target.name.replace("models/", "")
        : "gemini-1.5-flash-001";
    return finalName;
}
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
        try {
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash-001",
                generationConfig: isJsonMode
                    ? { responseMimeType: "application/json" }
                    : {},
            });
            const result = await model.generateContent(promptParts);
            return result.response.text();
        }
        catch (retryError) {
            throw new Error("AI processing failed completely: " + retryError.message);
        }
    }
}
async function callGeminiJson(apiKey, prompt) {
    if (!apiKey)
        return { action: "CHAT", reply: "⚠️ APIキー未設定" };
    try {
        const text = await generateContentWithRetry(apiKey, [{ text: prompt }], true);
        return extractJson(text);
    }
    catch (e) {
        return { action: "CHAT", reply: `💦 AIエラー: ${e.message}` };
    }
}
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
// --- Calendar Logic ---
async function refreshAccessToken(refreshToken) {
    try {
        const res = await axios_1.default.post("https://oauth2.googleapis.com/token", {
            client_id: googleClientId.value(),
            client_secret: googleClientSecret.value(),
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        return res.data;
    }
    catch (e) {
        return null;
    }
}
async function getValidAccessToken(uid) {
    var _a;
    const docRef = db
        .collection("users")
        .doc(uid)
        .collection("system")
        .doc("tokens");
    const snap = await docRef.get();
    if (!snap.exists)
        return null;
    const data = snap.data();
    if (!(data === null || data === void 0 ? void 0 : data.refreshToken))
        return null;
    if (data.accessToken) {
        try {
            await axios_1.default.get("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
                headers: { Authorization: `Bearer ${data.accessToken}` },
                params: { maxResults: 1 },
            });
            return data.accessToken;
        }
        catch (e) {
            if (((_a = e.response) === null || _a === void 0 ? void 0 : _a.status) !== 401)
                return data.accessToken;
        }
    }
    const newTokens = await refreshAccessToken(data.refreshToken);
    if (newTokens === null || newTokens === void 0 ? void 0 : newTokens.access_token) {
        await docRef.set({
            accessToken: newTokens.access_token,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return newTokens.access_token;
    }
    return null;
}
/// --- API calls ---
async function getCalendarEvents(uid) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return "（未連携）";
        const now = new Date();
        // JST時間に変換して日付を合わせる（UTC+9）
        const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        jstDate.setUTCHours(0, 0, 0, 0); // 時間を00:00:00にリセット
        // UTCに戻してAPI用の時刻形式にする
        const timeMin = new Date(jstDate.getTime() - 9 * 60 * 60 * 1000).toISOString();
        try {
            const res = await axios_1.default.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    timeMin: timeMin,
                    maxResults: 20,
                    singleEvents: true,
                    orderBy: "startTime",
                },
            });
            return (res.data.items || [])
                .map((e) => `${e.start.dateTime || e.start.date}: ${e.summary}`)
                .join("\n");
        }
        catch (_a) {
            return "（取得失敗）";
        }
    }
    catch (_b) {
        return "（エラー）";
    }
}
async function addCalendarEvent(uid, eventData) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return { success: false, isAuthError: true };
        let startBody = {};
        let endBody = {};
        const formattedStart = normalizeToJstIso(eventData.start);
        if (formattedStart.includes("T")) {
            startBody = { dateTime: formattedStart };
            if (eventData.end) {
                endBody = { dateTime: normalizeToJstIso(eventData.end) };
            }
            else {
                const sDate = new Date(formattedStart);
                const eDate = new Date(sDate.getTime() + 60 * 60 * 1000);
                endBody = { dateTime: eDate.toISOString() };
            }
        }
        else {
            startBody = { date: formattedStart };
            endBody = { date: formattedStart };
        }
        await axios_1.default.post("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            summary: eventData.title || "無題の予定",
            location: eventData.location || "",
            start: startBody,
            end: endBody,
        }, { headers: { Authorization: `Bearer ${token}` } });
        await db
            .collection("users")
            .doc(uid)
            .set({ isGoogleLinked: true }, { merge: true });
        return { success: true, isAuthError: false };
    }
    catch (e) {
        const isAuth = e.response && e.response.status === 401;
        return { success: false, isAuthError: isAuth };
    }
}
async function checkWeather(location, dateStr) {
    var _a, _b, _c;
    const apiKey = "2c7c3fae96274ac89f921959261102"; // WeatherAPI.com Key
    if (!apiKey)
        return null;
    try {
        const query = location || "Tokyo";
        const targetDate = new Date(dateStr);
        const url = `http://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(query)}&days=3&lang=ja`;
        const res = await axios_1.default.get(url);
        const forecastDays = ((_a = res.data.forecast) === null || _a === void 0 ? void 0 : _a.forecastday) || [];
        const targetYMD = targetDate.toISOString().split("T")[0];
        const targetForecast = forecastDays.find((d) => d.date === targetYMD);
        const forecast = targetForecast || forecastDays[0];
        if (!forecast)
            return null;
        let hourCondition = forecast.day;
        if (dateStr.includes("T")) {
            const hour = targetDate.getHours();
            const hourData = forecast.hour.find((h) => new Date(h.time).getHours() === hour);
            if (hourData)
                hourCondition = hourData;
        }
        const conditionText = ((_b = hourCondition.condition) === null || _b === void 0 ? void 0 : _b.text) || "晴れ";
        const conditionCode = ((_c = hourCondition.condition) === null || _c === void 0 ? void 0 : _c.code) || 1000;
        const precip = hourCondition.chance_of_rain !== undefined
            ? hourCondition.chance_of_rain
            : hourCondition.daily_chance_of_rain || 0;
        const icon = getWeatherEmoji(conditionCode);
        return {
            info: `予報は「${conditionText}」(降水確率${precip}%) です。`,
            icon: icon,
        };
    }
    catch (e) {
        return null;
    }
}
async function deleteCalendarEvent(uid, query) {
    try {
        const token = await getValidAccessToken(uid);
        if (!token)
            return null;
        const searchRes = await axios_1.default.get(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { q: query, maxResults: 5, singleEvents: true },
        });
        const events = searchRes.data.items || [];
        if (events.length === 0)
            return null;
        const target = events[0];
        await axios_1.default.delete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${target.id}`, { headers: { Authorization: `Bearer ${token}` } });
        return target.summary;
    }
    catch (_a) {
        return null;
    }
}
async function deleteTodoByTitle(uid, title) {
    try {
        const ref = db.collection("todos");
        const snap = await ref
            .where("userId", "==", uid)
            .where("isCompleted", "==", false)
            .get();
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
    catch (_a) {
        return null;
    }
}
async function deleteMemoryByContent(uid, content) {
    try {
        const ref = db.collection("memories");
        const snap = await ref.where("userId", "==", uid).limit(50).get();
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
    catch (_a) {
        return null;
    }
}
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
async function getOpenTodos(uid) {
    try {
        const snap = await db
            .collection("todos")
            .where("userId", "==", uid)
            .where("isCompleted", "==", false)
            .limit(20)
            .get();
        if (snap.empty)
            return "（未完了タスクなし）";
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
// --- Exports ---
exports.linkLineAccount = (0, https_1.onCall)({ secrets: [lineLoginChannelId, lineLoginChannelSecret], cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { code, redirectUri } = request.data;
    const clientId = lineLoginChannelId.value();
    const clientSecret = lineLoginChannelSecret.value();
    try {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);
        params.append("client_id", clientId);
        params.append("client_secret", clientSecret);
        const tokenRes = await axios_1.default.post("https://api.line.me/oauth2/v2.1/token", params);
        const { access_token } = tokenRes.data;
        const profileRes = await axios_1.default.get("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const { userId, displayName } = profileRes.data;
        await db.collection("users").doc(request.auth.uid).set({
            isLineLinked: true,
            lineUserId: userId,
            lineDisplayName: displayName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { success: true };
    }
    catch (e) {
        throw new https_1.HttpsError("internal", e.message);
    }
});
exports.refreshCalendarToken = (0, https_1.onCall)({ secrets: [googleClientId, googleClientSecret], cors: true }, async (req) => {
    var _a;
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const docRef = db
        .collection("users")
        .doc(req.auth.uid)
        .collection("system")
        .doc("tokens");
    const snap = await docRef.get();
    const rt = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.refreshToken;
    if (!rt)
        throw new https_1.HttpsError("not-found", "No refresh token");
    const newTokens = await refreshAccessToken(rt);
    if (!(newTokens === null || newTokens === void 0 ? void 0 : newTokens.access_token))
        throw new https_1.HttpsError("internal", "Failed");
    await docRef.set({
        accessToken: newTokens.access_token,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        accessToken: newTokens.access_token,
        expiresIn: newTokens.expires_in,
    };
});
exports.lineWebhook = (0, https_1.onRequest)({
    secrets: [
        lineBotToken,
        geminiApiKey,
        googleClientId,
        googleClientSecret,
        openWeatherApiKey,
    ],
    cors: true,
}, async (req, res) => {
    const token = lineBotToken.value();
    const apiKey = geminiApiKey.value();
    if (!token || !apiKey) {
        res.status(500).send("Config Error");
        return;
    }
    const client = new line.Client({ channelAccessToken: token });
    try {
        await Promise.all(req.body.events.map(async (event) => {
            var _a, _b;
            // ★修正: Postbackイベント（ボタンクリック）のハンドリング
            if (event.type === "postback") {
                const data = new URLSearchParams(event.postback.data);
                if (data.get("action") === "copy" && data.get("id")) {
                    const logDoc = await db
                        .collection("chat_logs")
                        .doc(data.get("id"))
                        .get();
                    const text = (_a = logDoc.data()) === null || _a === void 0 ? void 0 : _a.answer;
                    if (text) {
                        await client.replyMessage(event.replyToken, {
                            type: "text",
                            text: text,
                        });
                    }
                    return;
                }
            }
            if (event.type === "message" && event.message.type === "location") {
                const userId = event.source.userId;
                const usersSnap = await db
                    .collection("users")
                    .where("lineUserId", "==", userId)
                    .limit(1)
                    .get();
                if (!usersSnap.empty) {
                    const uid = usersSnap.docs[0].id;
                    const address = event.message.address;
                    await db
                        .collection("users")
                        .doc(uid)
                        .set({ defaultLocation: address }, { merge: true });
                    await client.replyMessage(event.replyToken, {
                        type: "text",
                        text: `📍 位置情報を保存しました！\n今後、場所を指定しない予定は「${address}」の天気をお知らせします。`,
                    });
                    return;
                }
            }
            if (event.type === "follow") {
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "友だち登録ありがとうございます！🎉\n\nこのアカウントはあなたの「第2の脳」です。\nアプリと連携して、AI秘書機能を活用してください✨\n\n📍 便利な機能:\nトーク画面の「＋」メニューから位置情報を送ると、あなたの街の天気を優先的に表示できるようになります！\n\n👇 アプリ画面に戻って連携を完了させてね！",
                });
                return;
            }
            if (event.type !== "message" || event.message.type !== "text")
                return;
            const lineUserId = event.source.userId;
            const messageId = event.message.id;
            const existingLog = await db
                .collection("chat_logs")
                .where("lineMessageId", "==", messageId)
                .limit(1)
                .get();
            if (!existingLog.empty) {
                console.log(`Duplicate message ${messageId} ignored.`);
                return;
            }
            const usersSnap = await db
                .collection("users")
                .where("lineUserId", "==", lineUserId)
                .limit(1)
                .get();
            if (usersSnap.empty) {
                await client.replyMessage(event.replyToken, {
                    type: "text",
                    text: "アプリと連携してください",
                });
                return;
            }
            const uid = usersSnap.docs[0].id;
            const logRef = db.collection("chat_logs").doc();
            await logRef.set({
                userId: uid,
                lineMessageId: messageId,
                question: event.message.text.trim(),
                answer: "Thinking...",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                isProcessing: true,
            });
            try {
                await axios_1.default.post("https://api.line.me/v2/bot/chat/loading/start", { chatId: lineUserId, loadingSeconds: 20 }, { headers: { Authorization: `Bearer ${token}` } });
            }
            catch (loadingError) {
                console.error("Loading animation error:", loadingError);
            }
            const message = event.message.text.trim();
            const userRef = db.collection("users").doc(uid);
            const userData = usersSnap.docs[0].data();
            const defaultLocation = userData.defaultLocation || "Tokyo";
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
                await logRef.update({
                    answer: `Mode changed to ${commands[message]}`,
                    isProcessing: false,
                });
                return;
            }
            const [context, memory, chat, cal, todo] = await Promise.all([
                userRef.collection("system").doc("user_context").get(),
                getRecentMemories(uid, message),
                getChatHistory(uid),
                getCalendarEvents(uid),
                getOpenTodos(uid),
            ]);
            const nowStr = new Date().toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
            });
            // 修正後（routerPrompt全体を差し替え、または該当行を追加）
            // ★修正: リンク参照とリマインダー削除の精度を向上させるプロンプトに変更
            const routerPrompt = `あなたはユーザーの「専属パートナーAI」です。現在日時: ${nowStr} (Asia/Tokyo)
          【カレンダー】(最新)
          ${cal}
          【未完了タスク】(最新)
          ${todo}
          【最近のメモ】(記憶)
          ${memory}
          【会話履歴】
          ${chat}
          【入力】"${message}"

          【指示】ユーザーの意図をJSONで出力。
          1. 「リンク教えて」「あのURLは？」等の質問には、【最近のメモ】や【会話履歴】から該当するURLを探し、**必ず返信テキスト内にURLを記載**してください（ボタン生成のため）。URLが複数ある場合は全て箇条書きで列挙してください。
          2. 「リマインド削除」「通知消して」は REMINDER_DELETE。「会議のリマインド消して」なら "会議" を targetKeyword に設定。
          3. 「メモ削除」「忘れて」は MEMORY_DELETE。削除したい内容を targetKeyword に設定。
          4. 日付指示（明日など）は現在日時基準で変換。

          出力JSON: {
          "action": "REMINDER_ADD"|"REMINDER_DELETE"|"CALENDAR_ADD"|"CALENDAR_DELETE"|"TASK_ADD"|"TASK_DELETE"|"MEMORY_ADD"|"MEMORY_DELETE"|"MEMORY_EDIT"|"MEMORY_APPEND"|"CHAT",
          "data": {
            "title": "件名",
            "start": "YYYY-MM-DDTHH:mm:ss+09:00",
            "end": "YYYY-MM-DDTHH:mm:ss+09:00",
            "location": "場所",
            "content": "内容",
            "targetKeyword": "削除や検索対象のキーワード(必須)",
            "targetId": "対象ID"
          },
          "reply": "ユーザーへの返信テキスト(URLはここに含める)"
          }`;
            const aiRes = await callGeminiJson(apiKey, routerPrompt);
            const action = aiRes.action || "CHAT";
            const data = aiRes.data || {};
            let replyText = aiRes.reply || "処理しました。";
            let flex = null;
            let newMemId = null;
            if (action === "CALENDAR_ADD") {
                const result = await addCalendarEvent(uid, {
                    title: data.title,
                    start: data.start,
                    end: data.end,
                    location: data.location,
                });
                if (result.success) {
                    const searchLocation = data.location || defaultLocation;
                    const weatherData = await checkWeather(searchLocation, data.start);
                    flex = createCalendarFlex(data.title, data.start, data.end, data.location, weatherData === null || weatherData === void 0 ? void 0 : weatherData.info, weatherData === null || weatherData === void 0 ? void 0 : weatherData.icon);
                    if (weatherData)
                        replyText += `\n(${weatherData.icon} ${weatherData.info})`;
                    let hintMessage = "";
                    if (!userData.defaultLocation) {
                        hintMessage =
                            "💡 ヒント: 位置情報を送ると、ご自宅周辺などの天気を表示できるようになります！";
                    }
                    await db.collection("notifications").add({
                        userId: uid,
                        type: "reservation",
                        title: "予定追加",
                        message: `「${data.title}」登録`,
                        isRead: false,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    const messages = [];
                    if (flex) {
                        messages.push({
                            type: "flex",
                            altText: replyText || "詳細情報",
                            contents: flex,
                        });
                    }
                    else {
                        if (replyText && replyText.trim() !== "") {
                            messages.push({
                                type: "flex",
                                altText: replyText,
                                contents: createChatFlex(replyText, logRef.id), // ★修正: ChatFlex使用
                            });
                        }
                    }
                    if (hintMessage) {
                        messages.push({ type: "text", text: hintMessage });
                    }
                    // ★URL追撃
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const extractedUrls = replyText.match(urlRegex);
                    if (extractedUrls && extractedUrls.length > 0) {
                        const urlMessage = `🔗 リンク:\n${extractedUrls.join("\n")}`;
                        messages.push({ type: "text", text: urlMessage });
                    }
                    if (messages.length > 0) {
                        await client.replyMessage(event.replyToken, messages);
                    }
                    await logRef.update({ answer: replyText, isProcessing: false });
                    return;
                }
                else {
                    if (result.isAuthError) {
                        flex = createReauthFlex();
                        replyText = "";
                    }
                    else {
                        replyText =
                            "⚠️ 申し訳ありません。カレンダーへの登録に失敗しました。時間をおいて再度お試しください。";
                    }
                }
            }
            else if (action === "REMINDER_ADD") {
                const scheduledIso = normalizeToJstIso(data.start);
                await db.collection("reminders").add({
                    userId: uid,
                    message: data.title || message,
                    scheduledAt: scheduledIso,
                    isSent: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                replyText = `⏰ リマインダーをセットしました\n${new Date(scheduledIso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} にお知らせします。`;
            }
            else if (action === "REMINDER_DELETE") {
                // AIが抽出したキーワードを使って、未送信のリマインダーを探す
                const keyword = data.targetKeyword || message;
                const remSnap = await db
                    .collection("reminders")
                    .where("userId", "==", uid)
                    .where("isSent", "==", false)
                    .get();
                // メッセージ内容にキーワードが含まれるものを1つ見つけて削除
                const targetRem = remSnap.docs.find((d) => d.data().message.includes(keyword));
                if (targetRem) {
                    await targetRem.ref.delete();
                    replyText = `🗑️ リマインダー「${targetRem.data().message}」を解除しました。`;
                }
                else {
                    replyText = `⚠️ 「${keyword}」に関連する未送信のリマインダーが見つかりませんでした。`;
                }
            }
            else if (action === "CALENDAR_DELETE") {
                const del = await deleteCalendarEvent(uid, data.title || message);
                if (del) {
                    replyText = `🗑️ 予定「${del}」を削除しました`;
                    await db.collection("notifications").add({
                        userId: uid,
                        type: "cancel",
                        title: "予定削除",
                        message: `「${del}」を削除しました`,
                        isRead: false,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                else {
                    replyText =
                        "⚠️ 該当する予定が見つからないか、削除に失敗しました。";
                }
            }
            else if (action === "TASK_ADD") {
                await db.collection("todos").add({
                    userId: uid,
                    title: data.title || message,
                    isCompleted: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                flex = createTaskFlex(data.title || message);
                await db.collection("notifications").add({
                    userId: uid,
                    type: "info",
                    title: "タスク追加",
                    message: `「${data.title || message}」を追加しました`,
                    isRead: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            else if (action === "TASK_DELETE") {
                const del = await deleteTodoByTitle(uid, data.title || message);
                replyText = del
                    ? `✅ タスク「${del}」完了`
                    : "タスクが見つかりません";
                if (del) {
                    await db.collection("notifications").add({
                        userId: uid,
                        type: "info",
                        title: "タスク完了",
                        message: `「${del}」を完了しました`,
                        isRead: false,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }
            else if (action === "MEMORY_ADD") {
                const ref = await db.collection("memories").add({
                    userId: uid,
                    text: data.content || message,
                    aiSummary: (data.content || message).slice(0, 20),
                    tags: ["LINE"],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                flex = createMemoryFlex(data.content || message);
                newMemId = ref.id;
                await db.collection("notifications").add({
                    userId: uid,
                    type: "info",
                    title: "メモ保存",
                    message: "新しい記憶を保存しました",
                    isRead: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            else if (action === "MEMORY_EDIT" && data.targetId) {
                const docId = data.targetId.replace(/\[ID:|\]|<<|>>/g, "").trim();
                await db
                    .collection("memories")
                    .doc(docId)
                    .update({ text: data.content });
                flex = createMemoryFlex(data.content, true);
                await db.collection("notifications").add({
                    userId: uid,
                    type: "info",
                    title: "メモ更新",
                    message: "更新しました",
                    isRead: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            else if (action === "MEMORY_APPEND" && data.targetId) {
                const docId = data.targetId.replace(/\[ID:|\]|<<|>>/g, "").trim();
                const snap = await db.collection("memories").doc(docId).get();
                const newText = (((_b = snap.data()) === null || _b === void 0 ? void 0 : _b.text) || "") + "\n(追記) " + data.content;
                await db
                    .collection("memories")
                    .doc(docId)
                    .update({ text: newText });
                flex = createMemoryFlex(newText, true);
                await db.collection("notifications").add({
                    userId: uid,
                    type: "info",
                    title: "メモ追記",
                    message: "追記しました",
                    isRead: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            else if (action === "MEMORY_DELETE") {
                const del = await deleteMemoryByContent(uid, data.content || message);
                replyText = del
                    ? `🗑️ メモ「${del}」を削除しました`
                    : "⚠️ 該当するメモが見つかりませんでした。";
            }
            if (newMemId)
                await userRef
                    .collection("system")
                    .doc("user_context")
                    .set({ lastMemoryId: newMemId }, { merge: true });
            await logRef.update({
                answer: replyText,
                mermaidCode: data.mermaid || null,
                isProcessing: false,
            });
            // ★修正: 通常会話もデフォルトでカード化
            if (!flex && replyText) {
                flex = createChatFlex(replyText, logRef.id);
            }
            // ★修正: URL検知＆テキスト追撃
            const messages = [];
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const extractedUrls = replyText.match(urlRegex);
            if (flex) {
                messages.push({
                    type: "flex",
                    altText: replyText || "詳細情報",
                    contents: flex,
                });
            }
            // URLがある場合、またはFlexがない場合はテキストも送る
            if (!flex) {
                messages.push({ type: "text", text: replyText });
            }
            else if (extractedUrls && extractedUrls.length > 0) {
                const urlMessage = `🔗 リンク:\n${extractedUrls.join("\n")}`;
                messages.push({ type: "text", text: urlMessage });
            }
            else if (replyText.includes("招待コード")) {
                // 招待コードの場合はコピーしやすいようにテキストも送る
                messages.push({ type: "text", text: replyText });
            }
            if (messages.length > 0) {
                await client.replyMessage(event.replyToken, messages);
            }
        }));
    }
    catch (e) {
        console.error(e);
    }
    res.json({ success: true });
});
// ▼▼▼ 修正: 重複通知バグを解消した通知機能 ▼▼▼
exports.checkUpcomingMeetings = (0, scheduler_1.onSchedule)({
    schedule: "every 15 minutes",
    secrets: [
        lineBotToken,
        googleClientId,
        googleClientSecret,
        openWeatherApiKey,
    ],
}, async (event) => {
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const users = await db
        .collection("users")
        .where("isLineLinked", "==", true)
        .get();
    for (const doc of users.docs) {
        const uid = doc.id;
        const token = await getValidAccessToken(uid);
        if (!token)
            continue;
        const userData = doc.data();
        const defaultLocation = userData.defaultLocation || "Tokyo";
        const now = new Date();
        // 1. 直前リマインド (25分後 〜 40分後)
        // ※30分前を狙うために幅を持たせています
        const soonMin = new Date(now.getTime() + 25 * 60000);
        const soonMax = new Date(now.getTime() + 40 * 60000);
        // 2. 明日の予定通知 (24時間後 〜 24時間15分後)
        // ※ちょうど24時間前を狙います
        const dayMin = new Date(now.getTime() + 24 * 60 * 60000);
        const dayMax = new Date(now.getTime() + (24 * 60 + 15) * 60000);
        const checks = [
            {
                min: soonMin.toISOString(),
                max: soonMax.toISOString(),
                minTime: soonMin.getTime(),
                maxTime: soonMax.getTime(),
                title: "まもなく開始",
            },
            {
                min: dayMin.toISOString(),
                max: dayMax.toISOString(),
                minTime: dayMin.getTime(),
                maxTime: dayMax.getTime(),
                title: "明日の予定",
            },
        ];
        for (const check of checks) {
            try {
                // GoogleカレンダーAPIは「期間に被っている予定」を全て返してしまう仕様
                const res = await axios_1.default.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        timeMin: check.min,
                        timeMax: check.max,
                        singleEvents: true,
                        orderBy: "startTime",
                    },
                });
                for (const ev of res.data.items || []) {
                    // 終日予定（誕生日など）は通知しない
                    if (ev.start.date)
                        continue;
                    // ★重要修正: 「開始時間」がチェック範囲に入っているか厳密に確認
                    const eventStart = new Date(ev.start.dateTime).getTime();
                    // 開始時間が範囲外（＝単に時間が被っているだけ）なら通知しない
                    if (eventStart < check.minTime || eventStart >= check.maxTime) {
                        continue;
                    }
                    const startTime = ev.start.dateTime;
                    const endTime = ev.end.dateTime;
                    const searchLoc = ev.location || defaultLocation;
                    const w = await checkWeather(searchLoc, startTime);
                    await client.pushMessage(doc.data().lineUserId, {
                        type: "flex",
                        altText: check.title,
                        contents: createReminderFlex(ev.summary, startTime, endTime, ev.location, w === null || w === void 0 ? void 0 : w.info, w === null || w === void 0 ? void 0 : w.icon, check.title),
                    });
                }
            }
            catch (e) {
                console.error(e);
            }
        }
    }
});
exports.sendMorningBriefing = (0, scheduler_1.onSchedule)({
    schedule: "0 7 * * *",
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey, googleClientId, googleClientSecret],
}, async () => {
    const users = await db
        .collection("users")
        .where("isLineLinked", "==", true)
        .get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    const todayStr = new Date().toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
    });
    for (const doc of users.docs) {
        const uid = doc.id;
        // ★修正: AIに渡す情報を「カレンダー」だけに限定
        const cal = await getCalendarEvents(uid);
        // ★修正: 極限まで簡潔なプロンプトに変更
        const prompt = `
      あなたは秘書です。今日は ${todayStr} です。
      以下の【今日の予定】のみを確認し、ユーザーに簡潔に伝えてください。

      【今日の予定】
      ${cal}

      【制約】
      1. 挨拶、励まし、メモやタスクへの言及は一切禁止です。
      2. カレンダーに記載されている「今日の予定」の事実のみを箇条書きで出力してください。
      3. 予定がない場合は「本日の予定はありません。」とだけ返してください。
      `;
        const text = await callGeminiText(apiKey, prompt);
        await client.pushMessage(doc.data().lineUserId, {
            type: "flex",
            altText: "今日の予定",
            contents: createChatFlex(`📅 ${todayStr} の予定\n\n${text}`),
        });
    }
});
// ★1分ごとにリマインダーをチェックする関数（修正版）
exports.checkReminders = (0, scheduler_1.onSchedule)({
    schedule: "every 1 minutes",
    secrets: [lineBotToken],
}, async (event) => {
    var _a;
    const now = new Date();
    // 修正：orderByを削除（インデックスエラー防止）
    const snapshot = await db
        .collection("reminders")
        .where("isSent", "==", false)
        .get();
    if (snapshot.empty)
        return;
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId || !data.scheduledAt) {
            console.error(`Invalid reminder ${doc.id}`);
            await doc.ref.update({ isSent: true, error: "Invalid Data" });
            continue;
        }
        const scheduledTime = new Date(normalizeToJstIso(data.scheduledAt));
        if (scheduledTime.getTime() > now.getTime())
            continue;
        const userDoc = await db.collection("users").doc(userId).get();
        const lineUserId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.lineUserId;
        if (lineUserId) {
            try {
                await client.pushMessage(lineUserId, {
                    type: "text",
                    text: `⏰ リマインダー: ${data.message}`,
                });
                await doc.ref.update({ isSent: true });
            }
            catch (err) {
                console.error(`Failed to send reminder for user ${userId}:`, err);
                await doc.ref.update({ isSent: true, error: "Send Failed" });
            }
        }
        else {
            await doc.ref.update({ isSent: true, error: "No Line ID" });
        }
    }
});
// ★招待コード適用API (永続特典版)
exports.redeemInviteCode = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Login required");
    const { inviteCode } = request.data;
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();
    if (userData === null || userData === void 0 ? void 0 : userData.invitedBy) {
        return { success: false, message: "既に招待コード適用済みです。" };
    }
    if ((userData === null || userData === void 0 ? void 0 : userData.inviteCode) === inviteCode) {
        return { success: false, message: "自分のコードは入力できません。" };
    }
    const query = db
        .collection("users")
        .where("inviteCode", "==", inviteCode)
        .limit(1);
    const querySnap = await query.get();
    if (querySnap.empty) {
        return { success: false, message: "無効な招待コードです。" };
    }
    const referrerDoc = querySnap.docs[0];
    const referrerId = referrerDoc.id;
    const referrerRef = db.collection("users").doc(referrerId);
    await db.runTransaction(async (t) => {
        t.update(referrerRef, {
            maxDailyLimit: admin.firestore.FieldValue.increment(3),
            referralCount: admin.firestore.FieldValue.increment(1),
        });
        t.update(userRef, {
            invitedBy: inviteCode,
            isReferralRedeemed: true,
            maxDailyLimit: admin.firestore.FieldValue.increment(3),
        });
        const noteRef = db.collection("notifications").doc();
        t.set(noteRef, {
            userId: referrerId,
            type: "info",
            title: "招待成功！",
            message: "友達がコードを使いました。1日の利用枠が永久に増えました！",
            isRead: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    return {
        success: true,
        message: "招待コードを適用しました！1日の利用枠が永久に増えました。",
    };
});
// ▼▼▼ 追加: 週間レポート＆提案機能（日曜20時に配信） ▼▼▼
exports.sendWeeklyRoutineSuggestion = (0, scheduler_1.onSchedule)({
    schedule: "0 20 * * 0", // 毎週日曜 20:00 (JST)
    timeZone: "Asia/Tokyo",
    secrets: [lineBotToken, geminiApiKey],
}, async () => {
    const users = await db
        .collection("users")
        .where("isLineLinked", "==", true)
        .get();
    const apiKey = geminiApiKey.value();
    const client = new line.Client({
        channelAccessToken: lineBotToken.value(),
    });
    for (const doc of users.docs) {
        const uid = doc.id;
        // ★強化ポイント: 「未完了タスク」も分析対象に追加
        const [history, memories, todos] = await Promise.all([
            getChatHistory(uid),
            getRecentMemories(uid, ""),
            getOpenTodos(uid), // ← これを追加！
        ]);
        // ★強化ポイント: AIへの指示を「コンサルタント」レベルに引き上げ
        const prompt = `
      あなたは優秀な専属コーチです。
      ユーザーの過去1週間のデータ（会話・メモ・未完了タスク）を分析し、
      来週の生産性を爆上げするための「具体的なアクション」を提案してください。

      【分析データ】
      🛑 未完了タスク:
      ${todos}

      📝 最近のメモ:
      ${memories}

      💬 最近の会話:
      ${history}

      【命令】
      以下の2つのセクションで構成された、短く鋭いアドバイスを出力してください。
      挨拶は不要です。各セクションは絵文字付きの見出しにしてください。

      1. 【🔥 未消化タスクの追撃】
         未完了タスクの中で、特に重要そうなものや、長く放置されているものを選び、「いつやるか」を問いかけてください。もしタスクがなければこの項目は省略可。

      2. 【✨ 習慣化の提案】
         会話やメモから「何度も言及していること」や「気にしているテーマ」を見つけ、「それをルーティン化しませんか？」と提案してください。
         (例: 「最近『ジム』という単語が多いですね。火曜日をジムの日に設定しますか？」)

      文字数は全体で200文字以内。箇条書きで簡潔に。
      `;
        const suggestion = await callGeminiText(apiKey, prompt);
        // 提案内容が空でなければ送信
        if (suggestion && suggestion.length > 10) {
            await client.pushMessage(doc.data().lineUserId, {
                type: "flex",
                altText: "週間振り返りレポート",
                contents: createRoutineSuggestionFlex(suggestion),
            });
        }
    }
});
