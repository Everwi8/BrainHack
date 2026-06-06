import { useEffect, useRef, useState } from "react";

// Recorder containers we prefer, in order — Chrome/Firefox give webm/opus,
// Safari falls back to mp4. We let the browser pick the first it supports.
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

// useVoiceRecorder wraps the MediaRecorder lifecycle behind a simple
// start()/stop() pair. start() returns an error string on failure (or null on
// success); stop() resolves to the recorded clip ({ blob, duration, mimeType }).
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const resolveRef = useRef(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Release the mic and timer if the component unmounts mid-recording.
  useEffect(() => () => { stopStream(); stopTimer(); }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return "Voice recording isn't supported in this browser.";
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopStream();
        setRecordingSeconds(duration);
        resolveRef.current?.({ blob, duration, mimeType: blob.type || recorder.mimeType || "audio/webm" });
        resolveRef.current = null;
      };

      startedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();
      timerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      return null;
    } catch {
      stopStream();
      return "Microphone permission denied or unavailable.";
    }
  };

  const stop = () =>
    new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      setIsRecording(false);
      stopTimer();
      recorder.stop();
    });

  return { isRecording, recordingSeconds, start, stop };
}

// extensionFromMime maps a recorder MIME type to a filename extension the STT
// backend recognises (it validates uploads by extension).
export function extensionFromMime(mimeType = "") {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "webm";
}
