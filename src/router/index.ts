import { createRouter, createWebHistory } from "vue-router";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import HomeView from "../views/HomeView/HomeView.vue";
import LoginView from "../views/LoginView/LoginView.vue";
import VerifyEmailView from "../views/VerifyEmailView/VerifyEmailView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
      meta: { requiresAuth: true },
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
  const currentUser = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (requiresAuth && !currentUser) {
    next("/login");
  } else if (to.path === "/login" && currentUser) {
    next("/");
  } else {
    next();
  }
});

export default router;
