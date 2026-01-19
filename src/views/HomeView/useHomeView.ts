import { ref, onMounted, watch, nextTick, type Ref } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";
import mermaid from "mermaid";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getApp } from "firebase/app";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";

// FullCalendar 関連
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { CalendarOptions } from "@fullcalendar/core";

export function useHomeView() {
  const { initAuth, chatLogs, isAiThinking, currentUser } = useMyBrain();
  const inputMode = ref<"memo" | "chat" | "url" | "calendar">("memo");
  const editingMemory = ref<Memory | null>(null);
  const chatContainerRef = ref<HTMLElement | null>(null);
  const showSuccessToast = ref(false);
  const calendarLoading = ref(false);

  const route = useRoute();
  const router = useRouter();

  // --- ボトムシート用ステート ---
  const isBottomSheetOpen = ref(false);
  const selectedDateStr = ref("");
  const selectedDateEvents = ref<any[]>([]);

  // ボトムシートを開く
  const openBottomSheet = (dateStr: string) => {
    selectedDateStr.value = dateStr;
    const events = (calendarOptions.value.events as any[]) || [];

    selectedDateEvents.value = events
      .filter((ev: any) => ev.start && ev.start.startsWith(dateStr))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

    isBottomSheetOpen.value = true;
  };

  const closeBottomSheet = () => {
    isBottomSheetOpen.value = false;
  };

  // ★追加: 予定を削除する関数
  const deleteEvent = async (eventId: string) => {
    const token = localStorage.getItem("google_calendar_token");
    if (!token)
      return alert("認証トークンがありません。再ログインしてください。");

    if (!confirm("この予定を削除してもよろしいですか？")) return;

    try {
      // 1. GoogleカレンダーAPIを叩いて削除
      await axios.delete(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // 2. ローカルの表示データから即座に削除（再取得を待たずにUI反映）
      // ボトムシート内のリストから消す
      selectedDateEvents.value = selectedDateEvents.value.filter(
        (e) => e.id !== eventId,
      );

      // カレンダー本体のデータからも消す
      const currentEvents = (calendarOptions.value.events as any[]) || [];
      calendarOptions.value.events = currentEvents.filter(
        (e: any) => e.id !== eventId,
      );
    } catch (e: any) {
      console.error(e);
      alert(
        "削除に失敗しました: " +
          (e.response?.data?.error?.message || e.message),
      );
    }
  };

  // --- カレンダー設定 ---
  const calendarOptions = ref<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev",
      center: "title",
      right: "next",
    },
    events: [] as any[],
    locale: "ja",
    height: "100%",
    expandRows: true,
    dayMaxEvents: 2,

    moreLinkClick: (arg) => {
      const dateStr = arg.date.toISOString().split("T")[0];
      openBottomSheet(dateStr);
      return "void";
    },

    dateClick: (info) => {
      openBottomSheet(info.dateStr);
    },

    eventClick: (info) => {
      info.jsEvent.preventDefault();
      const dateStr = info.event.startStr.split("T")[0];
      openBottomSheet(dateStr);
    },

    eventTimeFormat: {
      hour: "numeric",
      minute: "2-digit",
      meridiem: false,
      hour12: false,
    } as const,
    longPressDelay: 500,
    handleWindowResize: true,

    eventContent: function (arg: any) {
      return {
        html: `<div class="fc-content-custom">
                <div class="fc-marker" style="background-color: ${arg.event.backgroundColor}"></div>
                <div class="fc-details">
                  <span class="fc-time-custom">${arg.timeText}</span>
                  <span class="fc-title-custom">${arg.event.title}</span>
                </div>
              </div>`,
      };
    },
  });

  // --- カレンダーAPI取得 ---
  const fetchAllCalendars = async () => {
    const token = localStorage.getItem("google_calendar_token");
    if (!token) return;

    calendarLoading.value = true;
    try {
      let calendars = [{ id: "primary", backgroundColor: "#818cf8" }];

      try {
        const listRes = await axios.get(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (listRes.data.items) {
          calendars = listRes.data.items.map((cal: any) => ({
            id: cal.id,
            backgroundColor: cal.backgroundColor || "#818cf8",
          }));
        }
      } catch (e) {
        console.warn("カレンダーリスト取得不可");
      }

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

      const promises = calendars.map((cal) =>
        axios
          .get(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { timeMin, timeMax, singleEvents: true, maxResults: 250 },
            },
          )
          .catch(() => ({ data: { items: [] } })),
      );

      const results = await Promise.all(promises);

      const allEvents = results.flatMap((res, index) => {
        const color = calendars[index].backgroundColor;
        return (res.data.items || []).map((ev: any) => ({
          id: ev.id, // ★重要: 削除用にIDをマッピングに追加
          title: ev.summary || "(なし)",
          start: ev.start.dateTime || ev.start.date,
          end: ev.end.dateTime || ev.end.date,
          backgroundColor: color,
          allDay: !ev.start.dateTime,
        }));
      });

      calendarOptions.value.events = allEvents;
    } catch (e) {
      console.error("カレンダー取得エラー", e);
    } finally {
      calendarLoading.value = false;
    }
  };

  // --- チャットスクロール ---
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

  // --- ライフサイクル・監視 ---
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
        console.error(e);
        alert("LINE連携失敗");
      }
    }

    if (currentUser.value) {
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
        fetchAllCalendars();
      }, 100);
    }
  });

  watch(chatLogs, scrollToBottom, { deep: true });
  watch(isAiThinking, scrollToBottom);

  // --- ヘルパー ---
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
    deleteEvent, // ★エクスポート
  };
}
