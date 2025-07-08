import { Subject } from "rxjs";
import { sttRecognizedEventName, type SttRecognizedEventDetails } from "../shared/events";
import { AudioInputNode } from "./audio-input-node";
import type { SettingsNode } from "./settings-node";

export function defineOpenAISttStreamingNode(tagName = "openai-streaming-stt-node") {
  if (customElements.get(tagName)) return;
  customElements.define(tagName, OpenAIStreamingSttNode);
}

export class OpenAIStreamingSttNode extends HTMLElement {
  private isStarted = false;
  private isMicStarted = false;
  private mediaRecorderResolvers = Promise.withResolvers<MediaRecorder>();
  private abortController: AbortController | null = null;
  private transcription$ = new Subject<string>();

  connectedCallback() {
    this.transcription$.subscribe((text) => {
      this.dispatchEvent(
        new CustomEvent<SttRecognizedEventDetails>(sttRecognizedEventName, {
          detail: { text, isFinal: true },
        })
      );
    });
  }

  // Kick off and cache the MediaRecorder
  async startMicrophone() {
    if (this.isMicStarted) return;
    const audioInputNode = document.querySelector<AudioInputNode>("audio-input-node");
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { ideal: audioInputNode?.selectedDeviceId } },
    });
    const mr = new MediaRecorder(mediaStream);
    this.mediaRecorderResolvers.resolve(mr);
    this.isMicStarted = true;
    console.log("[openai-streaming-stt] mic started");
  }

  async start() {
    if (this.isStarted) return;
    await this.startMicrophone();

    const settings = document.querySelector<SettingsNode>("settings-node")?.getSettings();
    if (!settings?.openaiKey) throw new Error("Missing OpenAI API key");
    const apiKey = settings.openaiKey;

    this.isStarted = true;
    const mediaRecorder = await this.mediaRecorderResolvers.promise;
    this.abortController = new AbortController();

    mediaRecorder.start(250); // collect 250ms chunks

    transcribeOpenAIStreaming({
      mediaRecorder,
      apiKey,
      model: "gpt-4o-mini-transcribe",
      signal: this.abortController.signal,
      onDelta: (delta) => {
        // Emit intermediate results as non-final
        this.dispatchEvent(
          new CustomEvent<SttRecognizedEventDetails>(sttRecognizedEventName, {
            detail: { text: delta, isFinal: false },
          })
        );
      },
      onError: (err) => {
        console.error("[openai-streaming-stt] error", err);
        this.transcription$.next("");
      },
    })
      .then((text) => {
        this.transcription$.next(text);
      })
      .catch((err) => {
        console.error("[openai-streaming-stt] failed", err);
      });
  }

  async stop() {
    if (!this.isStarted) return;
    const mr = await this.mediaRecorderResolvers.promise;
    if (mr.state === "recording") mr.stop();
    this.isStarted = false;
    console.log("[openai-streaming-stt] stopped");
  }

  abort() {
    if (!this.isStarted) return;
    this.abortController?.abort();
    this.isStarted = false;
    console.log("[openai-streaming-stt] aborted");
  }
}

interface OpenAITranscribeStreamingOpts {
  apiKey: string;
  model: string;
  mediaRecorder: MediaRecorder;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onError?: (err: any) => void;
}

async function transcribeOpenAIStreaming(opts: OpenAITranscribeStreamingOpts): Promise<string> {
  const { apiKey, model, mediaRecorder, signal, onDelta, onError } = opts;

  // 1) Build a ReadableStream for the audio chunks
  let audioStreamController: ReadableStreamDefaultController<Blob>;
  const audioStream = new ReadableStream<Blob>({
    start(ctrl) {
      audioStreamController = ctrl;
    },
  });

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      audioStreamController.enqueue(ev.data);
    }
  };
  mediaRecorder.onstop = () => {
    audioStreamController.close();
  };

  // 2) Build a multipart/form-data ReadableStream with boundary
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const CRLF = "\r\n";

  // preamble: model field and stream=true
  const preamble =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
    `${model}${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="stream"${CRLF}${CRLF}` +
    `true${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="audio.webm"${CRLF}` +
    `Content-Type: ${mediaRecorder.mimeType || "audio/webm"}${CRLF}${CRLF}`;

  // epilogue
  const epilogue = `${CRLF}--${boundary}--${CRLF}`;

  // 3) Combine into one ReadableStream
  const multipartStream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      // send preamble
      ctrl.enqueue(new TextEncoder().encode(preamble));

      // pipe audio
      const reader = audioStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // value is Blob
        const buf = await value.arrayBuffer();
        ctrl.enqueue(new Uint8Array(buf));
      }

      // send epilogue
      ctrl.enqueue(new TextEncoder().encode(epilogue));
      ctrl.close();
    },
  });

  // 4) Fetch with streaming response
  let finalText = "";
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Accept: "text/event-stream",
      },
      body: multipartStream as any, // duplex
      // @ts-ignore
      duplex: "half",
      signal,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errorText}`);
    }

    if (!resp.body) {
      throw new Error("No response body");
    }

    // Parse Server-Sent Events
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // Remove 'data: ' prefix
          if (data.trim() === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "transcript.text.delta") {
              onDelta?.(parsed.delta);
            } else if (parsed.type === "transcript.text.done") {
              finalText = parsed.text;
            }
          } catch (e) {
            // Skip malformed JSON
            console.warn("[openai-streaming-stt] Failed to parse SSE data:", data);
          }
        }
      }
    }
  } catch (e) {
    onError?.(e);
    throw e;
  }

  return finalText;
}
