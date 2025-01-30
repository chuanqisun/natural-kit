import { sttRecognizedEventName, type SttRecognizedEventDetails } from "../shared/events";

export function defineWebSttNode(tagName = "web-stt-node") {
  customElements.define(tagName, WebSttNode);
}

export class WebSttNode extends HTMLElement {
  // Prevent starting multiple sessions
  private isStarted = false;
  private recognition = new webkitSpeechRecognition();

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
      this.dispatchEvent(
        new CustomEvent<SttRecognizedEventDetails>(sttRecognizedEventName, {
          detail: {
            text: latestItem[0].transcript,
            isFinal: latestItem.isFinal,
          },
        })
      );
    };
    this.recognition.onerror = (e) => {
      console.error(`[recognition] sliently omit error`, e);
      this.isStarted = false;
      if (this.recognition.continuous) {
        this.initSession();
        this.start();
      }
    };
    this.recognition.onend = () => {
      this.isStarted = false;
      this.recognition.stop();
      console.log("[recognition] session ended");
      if (this.recognition.continuous) {
        this.initSession();
        this.recognition.start();
      }
    };
  }

  public start() {
    if (this.isStarted) return;
    this.initSession();
    this.recognition.start();
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
