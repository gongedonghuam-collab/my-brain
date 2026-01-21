import { ref, onMounted, watch, nextTick, type Ref, computed } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import type { Memory, Todo, DailyReport } from "@/types";
import mermaid from "mermaid";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getApp } from "firebase/app";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { CalendarOptions } from "@fullcalendar/core";

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
    callGoogleApi, // ★追加: API呼び出しヘルパーを使用
  } = useMyBrain();
  const inputMode = ref<"memo" | "chat" | "url" | "calendar">("memo");
  const editingMemory = ref<Memory | null>(null);
  const chatContainerRef = ref<HTMLElement | null>(null);
  const showSuccessToast = ref(false);
  const calendarLoading = ref(false);
  const isReportModalOpen = ref(false);
  const route = useRoute();
  const router = useRouter();
  const isBottomSheetOpen = ref(false);
  const selectedDateStr = ref("");
  const selectedDateEvents = ref<any[]>([]);
  const relatedMemories = ref<Memory[]>([]);
  const isSearchingMemories = ref(false);

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
      // callGoogleApiでラップしてトークン切れに対応
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

  const calendarOptions = ref<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: "dayGridMonth",
    headerToolbar: { left: "prev", center: "title", right: "next" },
    events: [] as any[],
    locale: "ja",
    height: "100%",
    expandRows: true,
    dayMaxEvents: 2,
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
    eventContent: function (arg: any) {
      return {
        html: `<div class="fc-content-custom"><div class="fc-marker" style="background-color: ${arg.event.backgroundColor}"></div><div class="fc-details"><span class="fc-time-custom">${arg.timeText}</span><span class="fc-title-custom">${arg.event.title}</span></div></div>`,
      };
    },
  });

  const fetchAllCalendars = async () => {
    calendarLoading.value = true;
    try {
      // callGoogleApiを使ってカレンダーリストを取得
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
        } catch (e) {
          console.warn("List fetch failed, using primary only");
        }
        return list;
      });

      if (!calendars) return; // トークンがない場合など

      const now = new Date();
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

      // 各カレンダーのイベントを取得（ここもcallGoogleApiでラップ）
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
            .catch((e) => ({ data: { items: [] } })); // 個別のエラーは無視して空配列
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
    } finally {
      calendarLoading.value = false;
    }
  };

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
      suppressErrorRendering: true,
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
    if (currentUser.value) fetchAllCalendars();
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
  };
}
