import { defineAIBar } from "./ai-bar";
import { defineAudioInputNode } from "./nodes/audio-input-node";
import { defineAzureSttNode } from "./nodes/azure-stt-node";
import { defineAzureTtsNode } from "./nodes/azure-tts-node";
import { defineDragNode } from "./nodes/drag-node";
import { defineHideBar } from "./nodes/hide-node";
import { defineOpenAILlmNode } from "./nodes/openai-llm-node";
import { defineOpenAISttNode } from "./nodes/openai-stt-node";
import { defineOpenAISttStreamingNode } from "./nodes/openai-stt-streaming-node";

import { defineSettingsNode } from "./nodes/settings-node";
import { defineWebSttNode } from "./nodes/web-stt-node";
import { defineWebTtsNode } from "./nodes/web-tts-node";

export function loadAIBar() {
  // load container first to set internal event handlers
  defineAIBar();

  defineSettingsNode();
  defineAzureSttNode();
  defineAzureTtsNode();
  defineAudioInputNode();
  defineHideBar();
  defineDragNode();
  defineOpenAILlmNode();
  defineOpenAISttNode();
  defineOpenAISttStreamingNode();
  defineWebSttNode();
  defineWebTtsNode();
}
