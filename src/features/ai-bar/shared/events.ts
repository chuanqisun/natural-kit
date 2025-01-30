export const sttRecognizedEventName = "stt.recognized";
export type SttRecognizedEventDetails = {
  text: string;
  isFinal: boolean;
};
