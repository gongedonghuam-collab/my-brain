import { ref, onMounted, watch, nextTick, computed } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import type { Memory } from "@/types";
import mermaid from "mermaid"; // 図解を描画するライブラリ
import { httpsCallable, getFunctions } from "firebase/functions";
import { getApp } from "firebase/app";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";

// カレンダープラグイン（FullCalendar）
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { CalendarOptions } from "@fullcalendar/core";

// Googleカレンダーの色定義（IDと色の対応表）
const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  "1": "#7986cb", // ラベンダー
  "2": "#33b679", // セージ
  "3": "#8e24aa", // グレープ
  "4": "#e67c73", // フラミンゴ
  "5": "#f6c026", // バナナ
  "6": "#f4511e", // みかん
  "7": "#039be5", // ピーコック
  "8": "#616161", // グラファイト
  "9": "#3f51b5", // ブルーベリー（デフォルト）
  "10": "#0b8043", // バジル
  "11": "#d50000", // トマト
};

export function useHomeView() {
  // `useMyBrain` から必要な機能を借りてきます
  const {
    initAuth,
    chatLogs,
    isAiThinking,
    currentUser,
    findRelatedMemories,
    todos,
    dailyReports,
    toggleTodo,
    deleteTodo,
    callGoogleApi,
    isCalendarConnected,
    reconnectCalendar,
  } = useMyBrain();

  // --- 画面の状態管理変数 ---
  /** 現在の入力モード（メモ/チャット/URL/カレンダー） */
  const inputMode = ref<"memo" | "chat" | "url" | "calendar">("memo");
  /** 編集中のメモ（モーダルで開く用） */
  const editingMemory = ref<Memory | null>(null);
  /** チャット画面のスクロール制御用 */
  const chatContainerRef = ref<HTMLElement | null>(null);
  /** 成功トースト表示フラグ */
  const showSuccessToast = ref(false);
  /** カレンダー読み込み中フラグ */
  const calendarLoading = ref(false);
  /** 日報モーダル表示フラグ */
  const isReportModalOpen = ref(false);

  const route = useRoute();
  const router = useRouter();

  // --- カレンダー関連の状態 ---
  const isBottomSheetOpen = ref(false);
  const selectedDateStr = ref("");
  const selectedDateEvents = ref<any[]>([]);
  const relatedMemories = ref<Memory[]>([]);
  const isSearchingMemories = ref(false);

  /**
   * カレンダーの日付をクリックした時に、下からニョキッと詳細画面を出す関数
   */
  const openBottomSheet = async (dateStr: string) => {
    selectedDateStr.value = dateStr;
    relatedMemories.value = [];
    isSearchingMemories.value = false;

    // その日の予定をフィルタリングして表示
    const events = (calendarOptions.value.events as any[]) || [];
    selectedDateEvents.value = events
      .filter((ev: any) => ev.start && ev.start.startsWith(dateStr))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    isBottomSheetOpen.value = true;

    // その日の予定に関連するメモをAI検索して表示
    if (selectedDateEvents.value.length > 0) {
      isSearchingMemories.value = true;
      const queryText = selectedDateEvents.value.map((e) => e.title).join(" ");
      try {
        relatedMemories.value = await findRelatedMemories(queryText);
      } catch (e) {
        console.error("Related search failed", e);
      } finally {
        isSearchingMemories.value = false;
      }
    }
  };

  const closeBottomSheet = () => {
    isBottomSheetOpen.value = false;
  };

  /**
   * カレンダーの予定を削除する関数
   */
  const deleteEvent = async (eventId: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await callGoogleApi(async (token) => {
        await axios.delete(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      });
      // 画面上のリストからも削除
      selectedDateEvents.value = selectedDateEvents.value.filter(
        (e) => e.id !== eventId,
      );
      const currentEvents = (calendarOptions.value.events as any[]) || [];
      calendarOptions.value.events = currentEvents.filter(
        (e: any) => e.id !== eventId,
      );
    } catch (e: any) {
      alert("削除失敗: " + e.message);
    }
  };

  /**
   * FullCalendarの設定オブジェクト
   * ここでカレンダーの見た目や挙動を定義しています。
   */
  const calendarOptions = ref<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: "dayGridMonth",
    headerToolbar: { left: "prev", center: "title", right: "next" },
    events: [] as any[], // ここに予定データが入る
    locale: "ja", // 日本語化
    height: "100%",
    expandRows: true, // 行の高さを均等にする
    dayMaxEvents: 2, // 1日に表示する最大件数

    displayEventTime: false, // 時間は詳細で見せるので非表示

    // イベントの見た目をカスタマイズ
    eventContent: function (arg: any) {
      const timeText = arg.event.allDay ? "" : arg.timeText;
      return {
        html: `
          <div class="fc-content-custom">
            ${timeText ? `<span class="fc-time-custom">${timeText}</span>` : ""}
            <span class="fc-title-custom">${arg.event.title}</span>
          </div>
        `,
      };
    },

    moreLinkClick: (arg) => {
      openBottomSheet(arg.date.toISOString().split("T")[0]);
      return "void";
    },
    dateClick: (info) => {
      openBottomSheet(info.dateStr);
    },
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      openBottomSheet(info.event.startStr.split("T")[0]);
    },
    eventTimeFormat: {
      hour: "numeric",
      minute: "2-digit",
      meridiem: false,
      hour12: false,
    },
    longPressDelay: 500,
    handleWindowResize: true,
  });

  /**
   * Googleカレンダーから全ての予定を取得する関数
   */
  const fetchAllCalendars = async () => {
    calendarLoading.value = true;
    try {
      const calendars = await callGoogleApi(async (token) => {
        let list = [{ id: "primary", backgroundColor: "#818cf8" }];
        try {
          const listRes = await axios.get(
            "https://www.googleapis.com/calendar/v3/users/me/calendarList",
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (listRes.data.items) {
            list = listRes.data.items.map((cal: any) => ({
              id: cal.id,
              backgroundColor: cal.backgroundColor || "#818cf8",
            }));
          }
        } catch (e: any) {
          if (e.response && e.response.status === 401) {
            throw e;
          }
          console.warn("List fetch failed, using primary only");
        }
        return list;
      });

      if (!calendars) return;

      const now = new Date();
      // 表示範囲: 前後数ヶ月分
      const timeMin = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      ).toISOString();
      const timeMax = new Date(
        now.getFullYear(),
        now.getMonth() + 2,
        0,
      ).toISOString();

      const promises = calendars.map((cal: any) =>
        callGoogleApi(async (token) => {
          return axios
            .get(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
              {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                  timeMin,
                  timeMax,
                  singleEvents: true,
                  maxResults: 250,
                },
              },
            )
            .catch((e) => ({ data: { items: [] } }));
        }),
      );

      const results = await Promise.all(promises);
      const allEvents = results.flatMap((res: any, index) => {
        if (!res || !res.data) return [];
        const defaultColor = calendars[index].backgroundColor;
        return (res.data.items || []).map((ev: any) => {
          let bgColor = defaultColor;
          if (ev.colorId && GOOGLE_CALENDAR_COLORS[ev.colorId])
            bgColor = GOOGLE_CALENDAR_COLORS[ev.colorId];
          return {
            id: ev.id,
            title: ev.summary || "(なし)",
            start: ev.start.dateTime || ev.start.date,
            end: ev.end.dateTime || ev.end.date,
            backgroundColor: bgColor,
            allDay: !ev.start.dateTime,
          };
        });
      });
      calendarOptions.value.events = allEvents;
    } catch (e: any) {
      console.error("Calendar fetch global error:", e);
      if (e.response && e.response.status === 401) {
        localStorage.removeItem("google_calendar_token");
        isCalendarConnected.value = false;
      }
    } finally {
      calendarLoading.value = false;
    }
  };

  /**
   * チャット画面を一番下まで自動スクロールする関数
   */
  const scrollToBottom = async () => {
    if (inputMode.value !== "chat") return;
    await nextTick();
    setTimeout(() => {
      if (chatContainerRef.value)
        chatContainerRef.value.scrollTo({
          top: chatContainerRef.value.scrollHeight,
          behavior: "smooth",
        });
    }, 100);
  };

  onMounted(async () => {
    initAuth();
    // 図解ライブラリの初期化
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      suppressErrorRendering: true,
    });

    // LINEログインからのコールバック処理
    const code = route.query.code as string;
    if (code) {
      window.history.replaceState({}, document.title, "/app");
      try {
        const functions = getFunctions(getApp(), "asia-northeast1");
        const linkFunc = httpsCallable(functions, "linkLineAccount");
        await linkFunc({ code, redirectUri: window.location.origin + "/app" });
        showSuccessToast.value = true;
        setTimeout(() => (showSuccessToast.value = false), 5000);
      } catch (e) {
        alert("LINE連携失敗");
      }
    }
    if (currentUser.value) fetchAllCalendars();
  });

  // モード切替時の処理
  watch(inputMode, (newMode) => {
    if (newMode === "chat") {
      nextTick(() => {
        if (chatContainerRef.value)
          chatContainerRef.value.scrollTop =
            chatContainerRef.value.scrollHeight;
      });
      scrollToBottom();
    } else if (newMode === "calendar") {
      setTimeout(() => {
        // カレンダーのサイズを再計算させるハック
        window.dispatchEvent(new Event("resize"));
        fetchAllCalendars();
      }, 100);
    }
  });

  watch(chatLogs, scrollToBottom, { deep: true });
  watch(isAiThinking, scrollToBottom);

  const onOpenDetail = (memo: Memory) => {
    editingMemory.value = memo;
  };
  const onModeChange = (newMode: "memo" | "chat" | "url" | "calendar") => {
    inputMode.value = newMode;
  };
  const formatDateHeader = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${days[d.getDay()]})`;
  };
  const formatTimeRange = (ev: any) => {
    if (ev.allDay) return "終日";
    const start = new Date(ev.start);
    return start.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return {
    inputMode,
    editingMemory,
    chatContainerRef,
    showSuccessToast,
    calendarLoading,
    calendarOptions,
    isBottomSheetOpen,
    selectedDateStr,
    selectedDateEvents,
    openBottomSheet,
    closeBottomSheet,
    onOpenDetail,
    onModeChange,
    formatDateHeader,
    formatTimeRange,
    deleteEvent,
    relatedMemories,
    isSearchingMemories,
    todos,
    dailyReports,
    toggleTodo,
    deleteTodo,
    isReportModalOpen,
    isCalendarConnected,
    reconnectCalendar,
  };
}
