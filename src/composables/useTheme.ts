import { ref, onMounted, onUnmounted, watch } from "vue";

// グローバルステート
const isDark = ref(true);

export function useTheme() {
  const updateTheme = () => {
    const hour = new Date().getHours();
    // 6時から18時はライトモード(false)、それ以外はダークモード(true)
    // ※本来はユーザー設定やOS設定を優先すべきですが、要望通り時間で切り替えます
    const isNight = hour < 6 || hour >= 18;
    isDark.value = isNight;

    applyTheme();
  };

  const applyTheme = () => {
    const html = document.documentElement;
    if (isDark.value) {
      html.classList.add("dark");
      html.classList.remove("light");
    } else {
      html.classList.remove("dark");
      html.classList.add("light");
    }
  };

  let timer: any;

  const initTheme = () => {
    updateTheme();
    // 1分ごとにチェック
    timer = setInterval(updateTheme, 60000);
  };

  const cleanupTheme = () => {
    if (timer) clearInterval(timer);
  };

  return {
    isDark,
    initTheme,
    cleanupTheme,
  };
}
