import { useMyBrain } from "@/composables/useMyBrain";

/**
 * アプリヘッダーのロジックを管理するフック
 * 主にログアウト機能を提供します。
 */
export function useAppHeader() {
  // アプリ全体の脳みそ（useMyBrain）からログアウト機能だけを借ります
  const { logout } = useMyBrain();

  return {
    /** ログアウトを実行する関数 */
    logout,
  };
}
