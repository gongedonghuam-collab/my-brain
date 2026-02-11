import { ref, onMounted, watch, nextTick } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import type { Memory } from "@/types";
import mermaid from "mermaid";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getApp } from "firebase/app";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";

// FullCalendar（カレンダーライブラリ）のプラグイン
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { CalendarOptions } from "@fullcalendar/core";

// Googleカレンダーの色ID定義
const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f4511e",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d50000",
};

export function useHomeView() {
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
  const inputMode = ref<"memo" | "chat" | "url" | "calendar">("memo");
  const editingMemory = ref<Memory | null>(null);
  const chatContainerRef = ref<HTMLElement | null>(null);
  const showSuccessToast = ref(false);
  const calendarLoading = ref(false);
  const isReportModalOpen = ref(false);

  const route = useRoute();
  const router = useRouter();

  // --- カレンダー関連の状態 ---
  const isBottomSheetOpen = ref(false);
  const selectedDateStr = ref("");
  const selectedDateEvents = ref<any[]>([]);
  const relatedMemories = ref<Memory[]>([]);
  const isSearchingMemories = ref(false);

  // 初期ロード済みフラグ（無限ループ防止）
  const isInitialLoaded = ref(false);

  const openBottomSheet = async (dateStr: string) => {
    selectedDateStr.value = dateStr;
    relatedMemories.value = [];
    isSearchingMemories.value = false;

    const events = (calendarOptions.value.events as any[]) || [];
    selectedDateEvents.value = events
      .filter((ev: any) => ev.start && ev.start.startsWith(dateStr))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    isBottomSheetOpen.value = true;

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

  const deleteEvent = async (eventId: string) => {
    if (!confirm("削除しますか？")) return;
    try {
      await callGoogleApi(async (token) => {
        await axios.delete(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      });
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
   * Googleカレンダーから全ての予定を取得する関数
   */
  const fetchAllCalendars = async (startStr?: string, endStr?: string) => {
    if (calendarLoading.value) return;

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
          if (e.response && e.response.status === 401) throw e;
          console.warn("List fetch failed");
        }
        return list;
      });

      if (!calendars) return;

      const now = new Date();

      const timeMin = startStr
        ? new Date(startStr).toISOString()
        : new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();

      const timeMax = endStr
        ? new Date(endStr).toISOString()
        : new Date(now.getFullYear() + 1, now.getMonth(), 0).toISOString();

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
                  maxResults: 2500,
                },
              },
            )
            .catch(() => ({ data: { items: [] } }));
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
      isInitialLoaded.value = true;
    } catch (e: any) {
      if (e.response && e.response.status === 401) {
        localStorage.removeItem("google_calendar_token");
        isCalendarConnected.value = false;
      }
    } finally {
      calendarLoading.value = false;
    }
  };

  /**
   * FullCalendarの設定オブジェクト
   */
  const calendarOptions = ref<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: "dayGridMonth",

    headerToolbar: {
      left: "prev,next",
      center: "title",
      right: "dayGridMonth,listMonth",
    },

    buttonText: {
      today: "今日",
      month: "月",
      list: "一覧",
    },

    locale: "ja",
    height: "100%",
    expandRows: true,
    dayMaxEvents: true,
    navLinks: true,

    eventTimeFormat: {
      hour: "numeric",
      minute: "2-digit",
      meridiem: false,
    },

    views: {
      dayGridMonth: {
        titleFormat: { year: "numeric", month: "short" },
        dayMaxEvents: 3, // デフォルト
      },
      listMonth: {
        buttonText: "一覧",
        displayEventTime: true,
      },
    },

    // ウィンドウサイズで表示件数を調整
    windowResize: (arg) => {
      if (window.innerWidth < 768) {
        arg.view.calendar.setOption("dayMaxEvents", 4); // スマホは狭いので4件まで
      } else {
        arg.view.calendar.setOption("dayMaxEvents", 5); // PCは広め
      }
    },

    // ★重要: イベントの見た目をカスタマイズ（ドットではなく帯にする）
    eventContent: function (arg: any) {
      if (arg.view.type === "listMonth") {
        return {
          html: `<div class="fc-list-custom-title">${arg.event.title}</div>`,
        };
      }

      // CSS変数をセットして、スタイル側で色を反映
      const color = arg.event.backgroundColor;
      return {
        html: `
          <div class="fc-content-custom" style="--event-color: ${color}">
            <span class="fc-title-custom">${arg.event.title}</span>
          </div>
        `,
      };
    },

    dateClick: (info) => {
      openBottomSheet(info.dateStr);
    },
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      openBottomSheet(info.event.startStr.split("T")[0]);
    },

    datesSet: (arg) => {
      if (inputMode.value === "calendar") {
        fetchAllCalendars(arg.startStr, arg.endStr);
      }
    },

    longPressDelay: 500,
    handleWindowResize: true,
  });

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
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
    });

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

    if (route.query.reconnect === "true") {
      window.history.replaceState({}, document.title, "/app");
      setTimeout(() => {
        reconnectCalendar(true);
      }, 1000);
    }

    if (currentUser.value && !isInitialLoaded.value) {
      fetchAllCalendars();
    }
  });

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
        window.dispatchEvent(new Event("resize"));
        if (!calendarLoading.value) {
          fetchAllCalendars();
        }
      }, 100);
    } else {
      nextTick(() => {
        if (chatContainerRef.value) chatContainerRef.value.scrollTop = 0;
      });
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
    toggleTodo,
    deleteTodo,
    dailyReports,
    isReportModalOpen,
    isCalendarConnected,
    reconnectCalendar,
  };
}
