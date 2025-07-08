import { Subject } from "rxjs";
import { sttRecognizedEventName, type SttRecognizedEventDetails } from "../shared/events";
import { AudioInputNode } from "./audio-input-node";
import type { SettingsNode } from "./settings-node";

export function defineAzureSttNode(tagName = "azure-stt-node") {
  if (customElements.get(tagName)) return;
  customElements.define(tagName, AzureSttNode);
}

export class AzureSttNode extends HTMLElement {
  private isStarted = false;
  private transcription$ = new Subject<string>();
  private abortController: AbortController | null = null;
  private mediaRecorderAsync = Promise.withResolvers<MediaRecorder>();
  private isMicrophoneStarted = false;
  private transcriptionPromiseAPI: {
    promise: Promise<string>;
    resolve: (value: string) => void;
    reject: (reason?: any) => void;
  } | null = null;

  connectedCallback() {
    this.transcription$.subscribe((text) => {
      this.dispatchEvent(
        new CustomEvent<SttRecognizedEventDetails>(sttRecognizedEventName, {
          detail: {
            text,
            isFinal: true,
          },
        })
      );
    });
  }

  public async startMicrophone() {
    if (this.isMicrophoneStarted) return;

    const audioInputNode = document.querySelector<AudioInputNode>("audio-input-node");
    const media = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: {
          ideal: audioInputNode?.selectedDeviceId,
        },
      },
    });
    this.mediaRecorderAsync.resolve(new MediaRecorder(media));
    this.isMicrophoneStarted = true;
    console.log(`[azure-stt] microphone started`);
  }

  public start(): Promise<string> {
    if (this.isStarted) {
      return this.transcriptionPromiseAPI?.promise ?? Promise.resolve("");
    }

    const connection = document.querySelector<SettingsNode>("settings-node")?.getSettings();
    if (!connection?.azureSpeechKey || !connection?.azureSpeechRegion) {
      return Promise.reject(new Error("Missing Azure Speech credentials"));
    }

    this.isStarted = true;
    this.transcriptionPromiseAPI = Promise.withResolvers<string>();
    this.abortController = new AbortController();

    // Start the microphone if it hasn't been started yet
    if (!this.isMicrophoneStarted) {
      this.startMicrophone();
    }

    // The transcription process is kicked off here without awaiting it directly.
    // The promise it returns is handled to resolve/reject the promise we returned to the caller.
    this.beginTranscription(connection.azureSpeechKey, connection.azureSpeechRegion);

    return this.transcriptionPromiseAPI.promise;
  }

  private async beginTranscription(azureSpeechKey: string, azureSpeechRegion: string) {
    try {
      const mediaRecorder = await this.mediaRecorderAsync.promise;
      mediaRecorder.start();

      const result = await transcribe({
        speechKey: azureSpeechKey,
        speechRegion: azureSpeechRegion,
        mediaRecorder,
        signal: this.abortController!.signal,
        onSpeechEnded: () => console.log("[azure-stt] speech ended"),
        onTextStarted: () => console.log("[azure-stt] text started"),
      });

      const transcribedText = result.combinedPhrases.at(0)?.text ?? "";
      this.transcription$.next(transcribedText);
      this.transcriptionPromiseAPI?.resolve(transcribedText);
    } catch (e) {
      // This handles errors during transcription, e.g., network issues or aborts
      this.transcription$.next("");
      this.transcriptionPromiseAPI?.resolve(""); // Resolve with empty string on error/abort
      console.log("Transcribe handled error", e);
    } finally {
      // Clean up for the next session
      this.isStarted = false;
      this.transcriptionPromiseAPI = null;
      this.abortController = null;
    }
  }

  public async stop() {
    if (!this.isStarted) return;

    const mediaRecorder = await this.mediaRecorderAsync.promise;

    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    // The `beginTranscription` method will continue and resolve the promise upon completion.
    // We only set isStarted to false in the `finally` block of `beginTranscription`.
    console.log("[azure-stt] session stopped");
  }

  public abort() {
    if (!this.isStarted) return;

    this.abortController?.abort();
    // The promise will be resolved with "" in the catch block of `beginTranscription`
    // when the fetch is aborted.
    console.log("[azure-stt] session aborted");
  }
}

interface TranscribeOptions {
  locale?: "en-US";
  profanityFilterMode?: "None" | "Masked" | "Removed" | "Tags";
  speechRegion: string;
  speechKey: string;
  mediaRecorder: MediaRecorder;
  signal?: AbortSignal;
  onSpeechEnded?: () => void;
  onTextStarted?: () => void;
}

interface TranscribeResult {
  combinedPhrases: [
    {
      channel: number;
      text: string;
    }
  ];
  duration: number;
  phrases: [
    {
      channel: number;
      confidence: number;
      duration: number;
      locale: string;
      offset: number;
      text: string;
      words: [
        {
          text: string;
          offset: number;
          duration: number;
        }
      ];
    }
  ];
}

async function transcribe(options: TranscribeOptions): Promise<TranscribeResult> {
  const { speechKey: accessToken, locale = "en-US", profanityFilterMode = "None", mediaRecorder } = options;

  let audioStream: ReadableStream;
  let writer: ReadableStreamDefaultController;

  audioStream = new ReadableStream({
    start(controller) {
      writer = controller;
    },
  });

  mediaRecorder.ondataavailable = (event) => {
    writer.enqueue(event.data);
  };

  mediaRecorder.onstop = () => {
    options.onSpeechEnded?.();
    writer.close();
  };

  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

  const definition = JSON.stringify({
    locales: [locale],
    profanityFilterMode,
  });

  const formDataParts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="definition"\r\n',
    "Content-Type: application/json\r\n\r\n",
    definition + "\r\n",
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n',
    "Content-Type: audio/wav\r\n\r\n",
  ];

  const bodyStream = new ReadableStream({
    async start(controller) {
      for (const part of formDataParts) {
        controller.enqueue(new TextEncoder().encode(part));
      }

      const reader = audioStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(new Uint8Array(await value.arrayBuffer()));
      }

      controller.enqueue(new TextEncoder().encode(`\r\n--${boundary}--\r\n`));
      controller.close();
    },
  });

  const response = await fetch(`https://${options.speechRegion}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "ocp-apim-subscription-key": accessToken,
      "Content-Type": "multipart/form-data; boundary=" + boundary,
    },
    // @ts-expect-error, ref: https://github.com/node-fetch/node-fetch/issues/1769
    duplex: "half",
    body: bodyStream,
    signal: options.signal,
  });

  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));

  options.onTextStarted?.();
  return result as TranscribeResult;
}
