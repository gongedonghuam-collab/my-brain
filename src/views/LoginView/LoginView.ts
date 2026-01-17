import { ref } from "vue";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useRouter } from "vue-router";

export default function useLoginView() {
  const router = useRouter();
  const isLoginMode = ref(true);
  const email = ref("");
  const password = ref("");
  const loading = ref(false);

  const handleSubmit = async () => {
    if (!email.value || !password.value) return alert("入力してください");
    loading.value = true;
    const auth = getAuth();
    const db = getFirestore();

    try {
      if (isLoginMode.value) {
        // --- ログイン ---
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email.value,
          password.value
        );
        const user = userCredential.user;

        if (!user.emailVerified) {
          // 未認証なら待機画面へ
          router.push("/verify-email");
        } else {
          router.push("/");
        }
      } else {
        // --- 新規登録 ---
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.value,
          password.value
        );
        const user = userCredential.user;

        // ユーザー情報保存
        await setDoc(doc(db, "users", user.uid), {
          email: email.value,
          role: "student",
          createdAt: new Date(),
        });

        // ★メール送信
        await sendEmailVerification(user);
        alert(
          "確認メールを送信しました。\nメール内のリンクをクリックしてください。"
        );

        // 待機画面へ
        router.push("/verify-email");
      }
    } catch (e: any) {
      console.error(e);
      let msg = "エラーが発生しました";
      if (e.code === "auth/email-already-in-use")
        msg = "このメールアドレスは既に登録されています";
      if (e.code === "auth/weak-password")
        msg = "パスワードは6文字以上にしてください";
      if (e.code === "auth/invalid-credential")
        msg = "メールアドレスまたはパスワードが間違っています";
      alert(msg);
    } finally {
      loading.value = false;
    }
  };

  return {
    isLoginMode,
    email,
    password,
    loading,
    handleSubmit,
  };
}
