import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";
import { useHairLink } from "@/composables/useMyBrain";

const THEMES: Record<string, any> = {
  teal: {
    name: "Teal (Default)",
    primary: "teal",
    bgSoft: "bg-teal-50",
    textMain: "text-teal-600",
    textDark: "text-teal-800",
    border: "border-teal-100",
    gradient: "from-teal-600 to-cyan-500",
    shadow: "shadow-teal-200/50",
    accent: "bg-teal-600",
    button: "hover:bg-teal-100",
  },
  rose: {
    name: "Rose Pink",
    primary: "rose",
    bgSoft: "bg-rose-50",
    textMain: "text-rose-500",
    textDark: "text-rose-800",
    border: "border-rose-100",
    gradient: "from-rose-500 to-orange-400",
    shadow: "shadow-rose-200/50",
    accent: "bg-rose-500",
    button: "hover:bg-rose-100",
  },
  blue: {
    name: "Ocean Blue",
    primary: "blue",
    bgSoft: "bg-blue-50",
    textMain: "text-blue-600",
    textDark: "text-blue-800",
    border: "border-blue-100",
    gradient: "from-blue-600 to-indigo-500",
    shadow: "shadow-blue-200/50",
    accent: "bg-blue-600",
    button: "hover:bg-blue-100",
  },
  stone: {
    name: "Monochrome",
    primary: "stone",
    bgSoft: "bg-stone-100",
    textMain: "text-stone-600",
    textDark: "text-stone-800",
    border: "border-stone-200",
    gradient: "from-stone-700 to-stone-500",
    shadow: "shadow-stone-300/50",
    accent: "bg-stone-700",
    button: "hover:bg-stone-200",
  },
};

export default function useHomeView() {
  const auth = getAuth();
  const {
    currentUser,
    logs,
    allStylistLogs, // 1. ここで取得して
    clients,
    loading,
    fetchUserProfile,
    fetchLogs,
    fetchAllStylistLogs,
    fetchMyReservations,
    fetchStylistReservations,
    fetchMyReservation,
    fetchClientReservations,
    myReservations,
    stylistReservations,
    clientReservations,
    myReservation,
    addLog,
    deleteLog,
    connectUser,
    fetchMyClients,
    updateNextReservation,
    updateUserProfile,
    fetchInventory,
    cancelReservation,
  } = useHairLink();

  const currentTab = ref("home");
  const salesPeriod = ref("6m");
  const activeClientId = ref<string | null>(null);
  const activeConnectionId = ref<string | null>(null);
  const showQR = ref(false);
  const scanInput = ref("");
  const currentLogTargetId = ref<string | null>(null);
  const isSaving = ref(false);
  const editName = ref("");
  const editTheme = ref("teal");

  // 美容師が顧客詳細を開いたときの顧客情報
  const activeClientName = computed(() => {
    const client = clients.value.find(
      (c) => c.customerId === activeClientId.value,
    );
    return client ? client.customerName : "お客様";
  });

  let unsubscribe: any;

  onMounted(() => {
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await fetchUserProfile(user.uid);
      }
    });
  });

  onUnmounted(() => {
    if (unsubscribe) unsubscribe();
  });

  watch(
    currentUser,
    (user) => {
      if (user && user.uid) {
        editName.value = user.name || "";
        editTheme.value = user.themeColor || "teal";

        if (user.role === "customer") {
          currentLogTargetId.value = user.uid;
          fetchLogs(user.uid);
          fetchMyReservations(user.uid);
          fetchMyReservation(user.uid);
        } else if (user.role === "stylist") {
          fetchMyClients(user.uid);
          fetchAllStylistLogs(user.uid);
          fetchInventory();
          fetchStylistReservations(user.uid);
        }
      }
    },
    { immediate: true },
  );

  const selectClient = (client: any) => {
    activeClientId.value = client.customerId;
    activeConnectionId.value = client.id;
    currentLogTargetId.value = client.customerId;
    fetchLogs(client.customerId);
    fetchClientReservations(client.customerId);
  };

  const selectClientFromCalendar = (eventData: any) => {
    if (currentUser.value?.role === "customer") return;

    let customerId = "";
    if (typeof eventData === "string") {
      customerId = eventData;
    } else if (eventData?.customerId) {
      customerId = eventData.customerId;
    } else if (eventData?.extendedProps?.customerId) {
      customerId = eventData.extendedProps.customerId;
    } else if (eventData?.event?.extendedProps?.customerId) {
      customerId = eventData.event.extendedProps.customerId;
    }

    if (customerId) {
      const client = clients.value.find((c) => c.customerId === customerId);
      if (client) {
        selectClient(client);
        currentTab.value = "home";
      } else {
        console.warn("Client not found in list:", customerId);
        alert(
          "顧客データが見つかりません。リストが最新でない可能性があります。",
        );
      }
    } else {
      console.warn("No customer ID in event data");
    }
  };

  const goHome = () => {
    activeClientId.value = null;
    currentTab.value = "home";
  };

  const handleDeleteLog = async (id: string) => {
    await deleteLog(id);
  };

  const handleCancelReservation = async (id: string) => {
    await cancelReservation(id);
  };

  const handleConnect = async () => {
    if (!scanInput.value) return;
    const success = await connectUser(auth.currentUser!.uid, scanInput.value);
    if (success) {
      alert("顧客リストに追加しました！");
      scanInput.value = "";
    }
  };

  const handleQRDetect = async (decodedText: string) => {
    if (!decodedText) return;
    scanInput.value = decodedText;
    const success = await connectUser(auth.currentUser!.uid, decodedText);
    if (success) {
      alert("顧客リストに追加しました！ (QR)");
      scanInput.value = "";
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const onNextDateChange = async (client: any, event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      await updateNextReservation(client.id, input.value);
    }
  };

  const saveSettings = async () => {
    if (!auth.currentUser) return;
    isSaving.value = true;
    try {
      const success = await updateUserProfile(auth.currentUser.uid, {
        name: editName.value,
        themeColor: editTheme.value,
      });
      if (success) {
        alert("設定を保存しました✨");
        currentTab.value = "home";
      }
    } finally {
      isSaving.value = false;
    }
  };

  const currentTheme = computed(() => {
    const themeKey = currentUser.value?.themeColor || "teal";
    return THEMES[themeKey] || THEMES["teal"];
  });

  const currentMonthSales = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return allStylistLogs.value
      .filter((log) => {
        if (!log.date) return false;
        const logDate = new Date(log.date);
        return (
          logDate.getFullYear() === currentYear &&
          logDate.getMonth() + 1 === currentMonth
        );
      })
      .reduce((sum, log) => sum + (Number(log.price) || 0), 0);
  });

  const monthlySalesData = computed(() => {
    const sourceLogs =
      allStylistLogs.value.length > 0 ? allStylistLogs.value : [];
    const result = [];
    const now = new Date();

    if (salesPeriod.value === "1m") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const dateStr = d.getDate();
        const dailyTotal = sourceLogs
          .filter((log) => {
            if (!log.date) return false;
            const logDate = new Date(log.date);
            return (
              logDate.getFullYear() === y &&
              logDate.getMonth() + 1 === m &&
              logDate.getDate() === d.getDate()
            );
          })
          .reduce((sum, log) => sum + (Number(log.price) || 0), 0);
        result.push({ label: `${dateStr}日`, amount: dailyTotal });
      }
    } else {
      let monthsCount = 6;
      if (salesPeriod.value === "3m") monthsCount = 3;
      if (salesPeriod.value === "1y") monthsCount = 12;
      if (salesPeriod.value === "3y") monthsCount = 36;
      if (salesPeriod.value === "all") monthsCount = 60;

      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const monthlyTotal = sourceLogs
          .filter((log) => {
            if (!log.date) return false;
            const logDate = new Date(log.date);
            return (
              logDate.getFullYear() === year && logDate.getMonth() + 1 === month
            );
          })
          .reduce((sum, log) => sum + (Number(log.price) || 0), 0);
        let label = `${month}月`;
        if (month === 1 || i === monthsCount - 1) label = `${year}年${month}月`;
        result.push({ label: label, amount: monthlyTotal });
      }
    }
    return result;
  });

  const totalSales = computed(() => {
    return logs.value.reduce((sum, log) => sum + (Number(log.price) || 0), 0);
  });

  const clientsWithSales = computed(() => {
    return clients.value.map((client) => {
      const clientLogs = allStylistLogs.value.filter(
        (log) => log.customerId === client.customerId,
      );
      const ltv = clientLogs.reduce(
        (sum, log) => sum + (Number(log.price) || 0),
        0,
      );
      return { ...client, ltv };
    });
  });

  const calendarEvents = computed(() => {
    if (currentUser.value?.role === "stylist") {
      return stylistReservations.value.map((r) => ({
        date: r.date,
        title: `【${r.customerName || "客"}】${r.time} ${r.menu || ""}`,
        type: "reservation",
        customerId: r.customerId,
        extendedProps: {
          customerId: r.customerId,
        },
      }));
    } else {
      return myReservations.value.map((r) => ({
        date: r.date,
        title: `${r.time} 美容室 (${r.menu || ""})`,
        type: "reservation",
      }));
    }
  });

  return {
    currentTab,
    salesPeriod,
    currentUser,
    logs,
    allStylistLogs, // ★ 2. ここでreturnしないとVue側で使えません！(修正済み)
    clients,
    clientsWithSales,
    loading,
    activeClientId,
    activeConnectionId,
    activeClientName,
    clientReservations,
    showQR,
    scanInput,
    isSaving,
    fetchLogs,
    handleDeleteLog,
    handleConnect,
    handleQRDetect,
    logout,
    currentLogTargetId,
    selectClient,
    selectClientFromCalendar,
    goHome,
    onNextDateChange,
    totalSales,
    monthlySalesData,
    currentMonthSales,
    calendarEvents,
    myReservation,
    editName,
    editTheme,
    saveSettings,
    currentTheme,
    THEMES,
    handleCancelReservation,
  };
}
