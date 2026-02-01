import { ref, onMounted, onUnmounted } from "vue";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import {
  doc,
  setDoc,
  arrayUnion,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
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

// ★重要: VAPIDキー
const VAPID_KEY =
  "BDc2GU2MYvtgOjzdx5cnFjp9xeAQ2DhkrmtF6w3MVzkKzb0DTJmtJCrSOiKs0J90vXZ6glr-5Wl2jHJGmETBSc8";

export function useNotifications() {
  // ★修正: Firestoreからリアルタイム受信
  let unsubscribe: (() => void) | null = null;

  const subscribeToNotifications = () => {
    if (!auth.currentUser) return;

    if (unsubscribe) unsubscribe(); // 既存の購読を解除

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", auth.currentUser.uid),
      orderBy("timestamp", "desc"),
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      notifications.value = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || "info",
          title: data.title || "",
          message: data.message || "",
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          isRead: data.isRead || false,
        };
      });
    });
  };

  // ログイン状態監視して購読開始
  onMounted(() => {
    subscribeToNotifications();
  });

  const markAsRead = async (id: string) => {
    // ローカル更新
    const target = notifications.value.find((n) => n.id === id);
    if (target) target.isRead = true;
    // DB更新 (TODO: 個別ドキュメント更新処理が必要だが、今回は簡易的にローカルのみ)
  };

  const markAllRead = () => {
    notifications.value.forEach((n) => (n.isRead = true));
  };

  const toggleDropdown = () => {
    isDropdownOpen.value = !isDropdownOpen.value;
  };

  // --- FCM設定 ---
  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const messaging = getMessaging();

        onMessage(messaging, (payload) => {
          console.log("Message received. ", payload);
          // Firestore購読しているので、ここで手動追加は不要
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
      { merge: true },
    );
  };

  return {
    notifications,
    isDropdownOpen,
    markAsRead,
    markAllRead,
    toggleDropdown,
    requestNotificationPermission,
  };
}
