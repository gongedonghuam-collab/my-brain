import { ref, onMounted } from "vue";
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

// 通知データの型定義
export interface NotificationItem {
  id: string;
  type: "reservation" | "cancel" | "info"; // 通知の種類（アイコンの色などに影響）
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean; // 既読フラグ
}

// --- グローバルステート (アプリ全体で共有される変数) ---
// コンポーネントが再描画されてもデータを保持するために外に出しています
const notifications = ref<NotificationItem[]>([]);
const isDropdownOpen = ref(false);

// ★重要: Firebaseコンソールで取得したVAPIDキー (Webプッシュ通知用の公開鍵)
const VAPID_KEY =
  "BDc2GU2MYvtgOjzdx5cnFjp9xeAQ2DhkrmtF6w3MVzkKzb0DTJmtJCrSOiKs0J90vXZ6glr-5Wl2jHJGmETBSc8";

/**
 * 通知機能を管理するフック
 */
export function useNotifications() {
  // Firestoreの監視を解除するための関数を格納する変数
  let unsubscribe: (() => void) | null = null;

  /**
   * Firestoreの通知コレクションをリアルタイムで監視する関数
   * 新しい通知が来るたびに自動で notifications 配列が更新されます。
   */
  const subscribeToNotifications = () => {
    if (!auth.currentUser) return; // 未ログインなら何もしない

    if (unsubscribe) unsubscribe(); // 既に監視中なら一旦解除（二重監視防止）

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", auth.currentUser.uid), // 自分の通知だけ取得
      orderBy("timestamp", "desc"), // 新しい順
    );

    // リアルタイムリスナーの登録
    unsubscribe = onSnapshot(q, (snapshot) => {
      notifications.value = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || "info",
          title: data.title || "",
          message: data.message || "",
          // FirestoreのTimestamp型をJSのDate型に変換
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
          isRead: data.isRead || false,
        };
      });
    });
  };

  // コンポーネントがマウントされたら監視を開始
  onMounted(() => {
    subscribeToNotifications();
  });

  /**
   * 通知を既読にする関数
   * @param id - 通知ID
   */
  const markAsRead = async (id: string) => {
    // まずローカルの見た目を即座に更新（UX向上）
    const target = notifications.value.find((n) => n.id === id);
    if (target) target.isRead = true;

    // TODO: ここでFirestoreの updateDoc を呼んでサーバー側も更新するのが正式な実装
    // 現状はローカルのみの更新となっているようです
  };

  /**
   * 全ての通知を既読にする関数
   */
  const markAllRead = () => {
    notifications.value.forEach((n) => (n.isRead = true));
  };

  /**
   * 通知ドロップダウンの表示/非表示を切り替える関数
   */
  const toggleDropdown = () => {
    isDropdownOpen.value = !isDropdownOpen.value;
  };

  // --- FCM (Firebase Cloud Messaging) 設定 ---

  /**
   * ブラウザにプッシュ通知の許可を求める関数
   * 許可されたらデバイストークンを取得してDBに保存します。
   */
  const requestNotificationPermission = async () => {
    try {
      // ブラウザ標準の許可ダイアログを表示
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        const messaging = getMessaging();

        // アプリを開いている最中に通知が来た場合の処理
        onMessage(messaging, (payload) => {
          console.log("Message received. ", payload);
          // Firestoreを監視しているので、ここではトースト表示などを出すのが一般的
        });

        // このブラウザ固有のトークン（住所のようなもの）を取得
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token && auth.currentUser) {
          await saveTokenToDatabase(token);
        }
      }
    } catch (err) {
      console.error("Unable to get permission to notify.", err);
    }
  };

  /**
   * 取得したデバイストークンをFirestoreのユーザー情報に保存する関数
   * @param token - FCMトークン
   */
  const saveTokenToDatabase = async (token: string) => {
    if (!auth.currentUser) return;
    const userRef = doc(db, "users", auth.currentUser.uid);
    // arrayUnionを使うことで、既存のトークンリストに重複なく追加する
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
