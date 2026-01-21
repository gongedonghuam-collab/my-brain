import { ref, onMounted, type Ref } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";

type InputMode = "memo" | "chat" | "url" | "calendar";

export function useInputFooter(inputMode: Ref<InputMode>) {
  const { addMemory, addUrlMemory, askBrain, isAiThinking, isSpeaking } =
    useMyBrain();

  const inputText = ref("");
  // ★修正: 配列で管理
  const selectedFiles = ref<File[]>([]);
  const filePreviews = ref<string[]>([]);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const isListening = ref(false);
  const isVoiceMode = ref(false);

  let recognition: any = null;

  onMounted(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = "ja-JP";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
        inputText.value = transcript;
      };

      recognition.onend = () => {
        isListening.value = false;
        if (isVoiceMode.value && inputText.value.trim()) {
          handleSend(inputMode.value);
        }
      };
    }
  });

  const toggleListening = () => {
    if (!recognition) return alert("音声入力未対応ブラウザです");
    if (isListening.value) {
      recognition.stop();
      isVoiceMode.value = false;
    } else {
      isListening.value = true;
      isVoiceMode.value = true;
      recognition.start();
    }
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      // 既存のリストに追加
      const files = Array.from(target.files);
      selectedFiles.value = [...selectedFiles.value, ...files];

      // プレビュー生成
      files.forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              filePreviews.value.push(e.target.result as string);
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const clearFiles = () => {
    selectedFiles.value = [];
    filePreviews.value = [];
    if (fileInputRef.value) fileInputRef.value.value = "";
  };

  const handleInput = () => {
    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  const handleSend = async (mode: InputMode) => {
    const text = inputText.value.trim();
    if (!text && selectedFiles.value.length === 0) return;

    if (!isListening.value && !isVoiceMode.value) {
      isVoiceMode.value = false;
    }

    const currentText = text;
    inputText.value = "";

    if (mode === "memo") {
      const files = [...selectedFiles.value];
      clearFiles();
      const related = await addMemory(currentText, files);
      if (related && related.length > 0) {
        const summaries = related.map((m) => `・${m.aiSummary}`).join("\n");
        alert(`保存しました！\n\n💡 関連する過去の記憶:\n${summaries}`);
      }
    } else if (mode === "url") {
      await addUrlMemory(currentText);
    } else {
      clearFiles();
      await askBrain(currentText, isVoiceMode.value);
    }

    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  return {
    inputText,
    selectedFiles,
    filePreviews,
    fileInputRef,
    isListening,
    isAiThinking,
    isSpeaking,
    toggleListening,
    handleFileSelect,
    clearFiles,
    handleSend,
    handleInput,
  };
}
