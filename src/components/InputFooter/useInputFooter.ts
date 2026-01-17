import { ref, onMounted } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";

type InputMode = "memo" | "chat" | "url";

// ★修正: emit 引数を削除（使っていないため）
export function useInputFooter(inputMode: InputMode) {
  const { addMemory, addUrlMemory, askBrain, isAiThinking } = useMyBrain();

  const inputText = ref("");
  const selectedFile = ref<File | null>(null);
  const filePreview = ref<string | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const isListening = ref(false);
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
        inputText.value = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
      };
      recognition.onend = () => {
        isListening.value = false;
      };
    }
  });

  const toggleListening = () => {
    if (!recognition) return alert("音声入力未対応ブラウザです");
    if (isListening.value) recognition.stop();
    else {
      isListening.value = true;
      recognition.start();
    }
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      selectedFile.value = file;
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          filePreview.value = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        filePreview.value = null;
      }
    }
  };

  const clearFile = () => {
    selectedFile.value = null;
    filePreview.value = null;
    if (fileInputRef.value) fileInputRef.value.value = "";
  };

  const handleSend = async (mode: InputMode) => {
    const text = inputText.value.trim();
    if (!text && !selectedFile.value) return;

    if (mode === "memo") {
      inputText.value = "";
      const file = selectedFile.value;
      clearFile();
      await addMemory(text, file);
    } else if (mode === "url") {
      inputText.value = "";
      await addUrlMemory(text);
    } else {
      // チャットモード
      inputText.value = "";
      clearFile();
      await askBrain(text);
    }
  };

  return {
    inputText,
    selectedFile,
    filePreview,
    fileInputRef,
    isListening,
    isAiThinking,
    toggleListening,
    handleFileSelect,
    clearFile,
    handleSend,
  };
}
