"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline audio player. Lazy-fetches the recording the first time you press
 * play — keeps the calls list cheap to render (no preload). After the first
 * play, the browser caches the bytes so seeking + replay are instant.
 */
export function RecordingPlayer({
  conversationId,
  durationSeconds,
}: {
  conversationId: string;
  durationSeconds: number;
}) {
  const t = useTranslations("common");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  function toggle() {
    if (errored) return;
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      setLoading(true);
      el.play().catch(() => setErrored(true));
    }
  }

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={toggle}
        disabled={errored}
        className="h-7 w-7 p-0"
        title={errored ? t("recording_unavailable") : playing ? t("pause") : t("play")}
      >
        {loading && !playing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : playing ? (
          <Pause className="size-4 text-primary" />
        ) : (
          <Play className="size-4" />
        )}
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {fmt(durationSeconds)}
      </span>
      <audio
        ref={audioRef}
        src={`/api/voice/recording/${conversationId}`}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setErrored(true);
          setLoading(false);
        }}
        onCanPlay={() => setLoading(false)}
      />
    </div>
  );
}
