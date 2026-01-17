import { ref } from "vue";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from "@/firebase";

export interface NotificationItem {
  id: string;
  type: "reservation" | "cancel" | "info";
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

// グローバルステート
const notifications = ref<NotificationItem[]>([]);
const isDropdownOpen = ref(false);
const STORAGE_KEY = "hairlink_notifications";

// ★重要: Firebaseコンソールで取得したVAPIDキーを入れてください
const VAPID_KEY =
  "BDc2GU2MYvtgOjzdx5cnFjp9xeAQ2DhkrmtF6w3MVzkKzb0DTJmtJCrSOiKs0J90vXZ6glr-5Wl2jHJGmETBSc8";

export function useNotifications() {
  // 履歴をローカルストレージから読み込む
  const loadNotifications = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        notifications.value = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
      } catch (e) {
        console.error("Failed to load notifications", e);
      }
    }
  };

  // 履歴をローカルストレージに保存
  const saveNotifications = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.value));
  };

  // 通知を追加する
  const addNotification = (
    type: "reservation" | "cancel" | "info",
    title: string,
    message: string
  ) => {
    const newItem: NotificationItem = {
      id: Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date(),
      isRead: false,
    };
    notifications.value.unshift(newItem);

    // 最大50件まで保存
    if (notifications.value.length > 50) {
      notifications.value.pop();
    }

    saveNotifications();

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(200);
    }
  };

  const markAsRead = (id: string) => {
    const target = notifications.value.find((n) => n.id === id);
    if (target) {
      target.isRead = true;
      saveNotifications();
    }
  };

  const markAllRead = () => {
    notifications.value.forEach((n) => (n.isRead = true));
    saveNotifications();
  };

  const toggleDropdown = () => {
    isDropdownOpen.value = !isDropdownOpen.value;
  };

  const getUnreadCount = () =>
    notifications.value.filter((n) => !n.isRead).length;

  // --- FCM設定 ---
  const requestNotificationPermission = async () => {
    // まず履歴をロード
    loadNotifications();

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const messaging = getMessaging();

        // フォアグラウンド受信時
        onMessage(messaging, (payload) => {
          console.log("Message received. ", payload);
          addNotification(
            "info", // プッシュ通知はinfo扱い
            payload.notification?.title || "通知",
            payload.notification?.body || ""
          );
        });

        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token && auth.currentUser) {
          await saveTokenToDatabase(token);
        }
      }
    } catch (err) {
      console.error("Unable to get permission to notify.", err);
    }
  };

  const saveTokenToDatabase = async (token: string) => {
    if (!auth.currentUser) return;
    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(
      userRef,
      {
        fcmTokens: arrayUnion(token),
      },
      { merge: true }
    );
  };

  return {
    notifications,
    isDropdownOpen,
    addNotification,
    markAsRead,
    markAllRead,
    toggleDropdown,
    getUnreadCount,
    requestNotificationPermission,
  };
}
