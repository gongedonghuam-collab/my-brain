import { createRouter, createWebHistory } from "vue-router";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import HomeView from "../views/HomeView/HomeView.vue";
import LoginView from "../views/LoginView/LoginView.vue";
import VerifyEmailView from "../views/VerifyEmailView/VerifyEmailView.vue";
import LandingView from "../views/LandingView/LandingView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "landing",
      component: LandingView,
      meta: { public: true }, // 誰でも見れる
    },
    {
      path: "/app",
      name: "home",
      component: HomeView,
      meta: { requiresAuth: true }, // ログイン必須
    },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { public: true },
    },
    {
      path: "/verify-email",
      name: "verify-email",
      component: VerifyEmailView,
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  const auth = getAuth();
  // 認証状態の確定を待つ
  const currentUser = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  // 1. トップページ(LP)にアクセスした時
  if (to.path === "/") {
    if (currentUser) {
      // ログイン済みならアプリへ転送
      next("/app");
      return;
    } else {
      // 未ログインならLPを表示
      next();
      return;
    }
  }

  // 2. ログインが必要なページ (/appなど) に未ログインでアクセス
  if (requiresAuth && !currentUser) {
    next("/login");
  }
  // 3. ログイン画面 (/login) にログイン済みでアクセス
  else if (to.path === "/login" && currentUser) {
    next("/app");
  }
  // 4. それ以外
  else {
    next();
  }
});

export default router;
