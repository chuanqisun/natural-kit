import { sttRecognizedEventName, type SttRecognizedEventDetails } from "../shared/events";

export function defineWebSttNode(tagName = "web-stt-node") {
  customElements.define(tagName, WebSttNode);
}

export class WebSttNode extends HTMLElement {
  // Prevent starting multiple sessions
  private isStarted = false;
  private recognition = new webkitSpeechRecognition();
  private transcriptionPromise: PromiseWithResolvers<string> | null = null;

  constructor() {
    super();
    this.recognition.interimResults = true;
  }

  private initSession() {
    this.isStarted = true;

    this.recognition.continuous = true;
    this.recognition.lang = "en-US";
    this.recognition.onstart = () => console.log("[recognition] session stated");
    this.recognition.onresult = (e) => {
      const latestItem = [...e.results].at(-1);
      if (!latestItem) return;

      const text = latestItem[0].transcript;
      const isFinal = latestItem.isFinal;

      this.dispatchEvent(
        new CustomEvent<SttRecognizedEventDetails>(sttRecognizedEventName, {
          detail: {
            text,
            isFinal,
          },
        })
      );

      if (isFinal) {
        this.transcriptionPromise?.resolve(text);
        // Reset for the next potential start() call within the same session
        this.transcriptionPromise = null;
      }
    };
    this.recognition.onerror = (e) => {
      console.error(`[recognition] silently omit error`, e);
      this.transcriptionPromise?.reject(e.error);
      this.isStarted = false;
      if (this.recognition.continuous) {
        this.initSession();
        this.start();
      }
    };
    this.recognition.onend = () => {
      this.isStarted = false;
      // If the session ends without a final result, resolve with an empty string.
      this.transcriptionPromise?.resolve("");
      this.transcriptionPromise = null;
      this.recognition.stop();
      console.log("[recognition] session ended");
      if (this.recognition.continuous) {
        this.initSession();
        this.recognition.start();
      }
    };
  }

  public start(): Promise<string> {
    if (this.isStarted) {
      // If a recognition is already in progress, return the existing promise.
      // If a new promise is needed for a subsequent recognition in the same session, create it.
      if (!this.transcriptionPromise) {
        this.transcriptionPromise = Promise.withResolvers<string>();
      }
      return this.transcriptionPromise.promise;
    }

    this.transcriptionPromise = Promise.withResolvers<string>();
    this.initSession();
    this.recognition.start();
    return this.transcriptionPromise.promise;
  }

  public stop() {
    this.recognition.continuous = false;
    this.recognition.stop();
  }

  public abort() {
    this.recognition.continuous = false;
    this.recognition.abort();
  }
}
