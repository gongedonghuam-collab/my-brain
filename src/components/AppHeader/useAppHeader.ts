import { useMyBrain } from "@/composables/useMyBrain";

export function useAppHeader() {
  // 脳みそ機能（ログアウトなど）を持ってくる
  const { logout } = useMyBrain();

  return {
    logout, // 画面で使えるようにする
  };
}
