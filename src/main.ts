import { loadAIBar } from "./features/ai-bar/loader";
import { AzureSttNode } from "./features/ai-bar/nodes/azure-stt-node";
import type { AzureTtsNode } from "./features/ai-bar/nodes/azure-tts-node";
import type { OpenAILlmNode } from "./features/ai-bar/nodes/openai-llm-node";
import type { OpenAISttNode } from "./features/ai-bar/nodes/openai-stt-node";
import type { OpenAIStreamingSttNode } from "./features/ai-bar/nodes/openai-stt-streaming-node";
import type { WebSttNode } from "./features/ai-bar/nodes/web-stt-node";
import type { WebTtsNode } from "./features/ai-bar/nodes/web-tts-node";
import { sttRecognizedEventName, type SttRecognizedEventDetails } from "./features/ai-bar/shared/events";
import { user } from "./features/llm/message";
import "./style.css";

loadAIBar();

document.querySelector<HTMLButtonElement>(`[data-action="test-chat"]`)?.addEventListener("click", async () => {
  const aoai = await document.querySelector<OpenAILlmNode>("openai-llm-node")!.getClient("aoai");
  const response = await aoai.chat.completions.create({
    messages: [user`Howdy cowboy`],
    model: "gpt-4o-mini",
  });
  console.log(response);
});

document.querySelector<HTMLButtonElement>(`[data-action="test-azure-tts"]`)?.addEventListener("click", async () => {
  const tts = await document.querySelector<AzureTtsNode>("azure-tts-node");
  tts?.queue("Hello world", { onStart: () => console.log("start"), onEnd: () => console.log("end") });
});

document.querySelector<HTMLButtonElement>(`[data-action="test-web-tts"]`)?.addEventListener("click", async () => {
  const tts = await document.querySelector<WebTtsNode>("web-tts-node");
  tts?.queue("Hello world", { onStart: () => console.log("start"), onEnd: () => console.log("end") });
});

document.querySelector<HTMLButtonElement>(`[data-action="test-azure-stt"]`)?.addEventListener(
  "click",
  async () => {
    const stt = document.querySelector<AzureSttNode>("azure-stt-node")!;
    await stt.startMicrophone();
    const trigger = document.querySelector<HTMLButtonElement>(`[data-action="test-azure-stt"]`)!;
    trigger.textContent = "Hold to speak";

    trigger.addEventListener("mousedown", async () => {
      trigger.textContent = "Release to send";
      stt?.start();
    });

    trigger.addEventListener("mouseup", async () => {
      trigger.textContent = "Hold to speak";
      stt?.stop();
    });

    stt.addEventListener(sttRecognizedEventName, (e) => {
      const detail = (e as CustomEvent<SttRecognizedEventDetails>).detail;
      console.log(detail);
    });
  },
  { once: true }
);

document.querySelector<HTMLButtonElement>(`[data-action="test-openai-stt"]`)?.addEventListener(
  "click",
  async () => {
    const stt = document.querySelector<OpenAISttNode>("openai-stt-node")!;
    await stt.startMicrophone();
    const trigger = document.querySelector<HTMLButtonElement>(`[data-action="test-openai-stt"]`)!;
    trigger.textContent = "Hold to speak";

    trigger.addEventListener("mousedown", async () => {
      trigger.textContent = "Release to send";
      stt?.start();
    });

    trigger.addEventListener("mouseup", async () => {
      trigger.textContent = "Hold to speak";
      stt?.stop();
    });

    stt.addEventListener(sttRecognizedEventName, (e) => {
      const detail = (e as CustomEvent<SttRecognizedEventDetails>).detail;
      console.log(detail);
    });
  },
  { once: true }
);

document.querySelector<HTMLButtonElement>(`[data-action="test-openai-streaming-stt"]`)?.addEventListener(
  "click",
  async () => {
    const stt = document.querySelector<OpenAIStreamingSttNode>("openai-streaming-stt-node")!;
    await stt.startMicrophone();
    const trigger = document.querySelector<HTMLButtonElement>(`[data-action="test-openai-streaming-stt"]`)!;
    trigger.textContent = "Hold to speak";

    trigger.addEventListener("mousedown", async () => {
      trigger.textContent = "Release to send";
      stt?.start();
    });

    trigger.addEventListener("mouseup", async () => {
      trigger.textContent = "Hold to speak";
      stt?.stop();
    });

    stt.addEventListener(sttRecognizedEventName, (e) => {
      const detail = (e as CustomEvent<SttRecognizedEventDetails>).detail;
      console.log(detail);
    });
  },
  { once: true }
);

document.querySelector<HTMLButtonElement>(`[data-action="test-web-stt"]`)?.addEventListener(
  "click",
  async () => {
    const stt = document.querySelector<WebSttNode>("web-stt-node")!;
    const trigger = document.querySelector<HTMLButtonElement>(`[data-action="test-web-stt"]`)!;
    trigger.textContent = "Hold to speak";

    trigger.addEventListener("mousedown", async () => {
      trigger.textContent = "Release to send";
      stt?.start();
    });

    trigger.addEventListener("mouseup", async () => {
      trigger.textContent = "Hold to speak";
      stt?.stop();
    });

    stt.addEventListener(sttRecognizedEventName, (e) => {
      const detail = (e as CustomEvent<SttRecognizedEventDetails>).detail;
      console.log(detail);
    });
  },
  { once: true }
);
