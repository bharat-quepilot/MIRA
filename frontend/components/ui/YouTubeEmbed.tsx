"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";

import { loadYouTubeAPI, type YTPlayer } from "@/lib/youtube/loader";
import type { CourseStatus } from "@/lib/progress/types";

interface Props {
  videoId: string;
  /** Where to send the user if embed is blocked (age restriction, embed disabled, etc.) */
  fallbackUrl: string;
  initialStatus: CourseStatus;
  /** Called when our auto-tracking flips the status. Idempotent — caller decides whether to persist. */
  onStatusChange: (next: CourseStatus) => void;
  /** Auto-complete threshold; default 0.9 = 90% of duration actually watched. */
  completeAt?: number;
}

/**
 * Embeds a YouTube video and auto-tracks progress.
 *
 *   - First "PLAYING" state event: flip status `not_started → in_progress`.
 *   - Polling (2s while playing) tracks `maxSeenT` — the furthest point the
 *     timeline has *advanced through contiguously*. A scrub to the end does
 *     not credit watched seconds.
 *   - When `maxSeenT / duration ≥ completeAt`, flip status to `completed`.
 *   - `onError` from the API (embed disabled, age-restricted, etc.) falls back
 *     to a notice + external link — preserves the existing Approach D flow.
 *
 * Edge cases handled:
 *   - Component unmount: clears the polling interval and destroys the YT player.
 *   - Tab backgrounded: setInterval throttled to 1Hz; tracking still works.
 *   - Multiple instances: each owns its own player and polling.
 */
export function YouTubeEmbed({
  videoId,
  fallbackUrl,
  initialStatus,
  onStatusChange,
  completeAt = 0.9,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxSeenRef = useRef<number>(0);
  const completedRef = useRef<boolean>(initialStatus === "completed");
  // Stable refs for callbacks so the player init effect doesn't re-run.
  const cbsRef = useRef({ onStatusChange, initialStatus, completeAt });
  cbsRef.current = { onStatusChange, initialStatus, completeAt };

  const [error, setError] = useState<string | null>(null);
  const [completedBadge, setCompletedBadge] = useState<boolean>(
    initialStatus === "completed",
  );

  useEffect(() => {
    let cancelled = false;

    const stopPolling = () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p) return;
        let t = 0;
        let total = 0;
        try {
          t = p.getCurrentTime();
          total = p.getDuration();
        } catch {
          return;
        }
        if (!total || total <= 0) return;

        // Anti-skip: only extend coverage when the timeline advanced contiguously.
        // A jump forward by more than 5s (scrubbing/seeking) is ignored.
        const jump = t - maxSeenRef.current;
        if (jump > 0 && jump <= 5) {
          maxSeenRef.current = t;
        }

        if (!completedRef.current && maxSeenRef.current / total >= cbsRef.current.completeAt) {
          completedRef.current = true;
          setCompletedBadge(true);
          cbsRef.current.onStatusChange("completed");
          stopPolling();
        }
      }, 2000);
    };

    loadYouTubeAPI()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        playerRef.current = new YT.Player(containerRef.current, {
          videoId,
          // YT.Player replaces our <div> with an <iframe>. We size it via
          // CSS in onReady (below) so the iframe fills our 16:9 wrapper
          // instead of using the API's default 640×390 attributes.
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,            // don't show "related from other channels" at end
            modestbranding: 1, // less branded chrome
          },
          events: {
            onReady: (e) => {
              try {
                // The .yt-embed-wrap CSS rule already forces the iframe to
                // fill the wrapper via !important; this is a belt-and-suspenders
                // fallback that strips the API's hardcoded width/height
                // attributes in case a future browser stops respecting our
                // !important rules.
                const iframe = e.target.getIframe?.();
                if (iframe) {
                  iframe.removeAttribute("width");
                  iframe.removeAttribute("height");
                }
                e.target.playVideo();
              } catch {
                /* autoplay can fail silently; user can press play */
              }
            },
            onStateChange: (e) => {
              const state = e.data;
              if (state === YT.PlayerState.PLAYING) {
                if (cbsRef.current.initialStatus === "not_started") {
                  cbsRef.current.onStatusChange("in_progress");
                }
                startPolling();
              } else {
                stopPolling();
              }
              if (state === YT.PlayerState.ENDED && !completedRef.current) {
                completedRef.current = true;
                setCompletedBadge(true);
                cbsRef.current.onStatusChange("completed");
              }
            },
            onError: () => {
              // 2 invalid id, 5 HTML5 error, 100 not found, 101/150 embed disabled.
              setError(
                "This video can't be played here. Open it on YouTube to continue.",
              );
              stopPolling();
            },
          },
        });
      })
      .catch(() => {
        setError("Couldn't load the YouTube player. Open the video externally.");
      });

    return () => {
      cancelled = true;
      stopPolling();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* destroy can throw if player not fully initialized — safe to ignore */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]); // intentional: callbacks come through cbsRef to avoid tear-down on prop change

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-none" />
          <span>{error}</span>
        </div>
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline"
        >
          Open on YouTube <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/*
        .yt-embed-wrap (defined in globals.css) gives a bulletproof 16:9 box
        via padding-bottom and forces any <iframe> descendant to fill it with
        !important rules. We deliberately avoid `aspect-ratio` here because
        a constrained parent can defeat it; padding-bottom resolves against
        the parent *width*, so the ratio is always honored.
      */}
      <div className="yt-embed-wrap">
        <div ref={containerRef} />
      </div>
      {completedBadge && (
        <span className="absolute right-2 top-2 rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white shadow">
          ✓ Auto-completed
        </span>
      )}
    </div>
  );
}
