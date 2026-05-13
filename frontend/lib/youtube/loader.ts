// Minimal type surface for the bits of the YT IFrame API we use.
// We deliberately avoid pulling in @types/youtube — the runtime contract is
// small and stable, and we keep this honest about exactly what we depend on.
export interface YTPlayerState {
  UNSTARTED: -1;
  ENDED: 0;
  PLAYING: 1;
  PAUSED: 2;
  BUFFERING: 3;
  CUED: 5;
}

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  /** Returns the underlying <iframe> element. Useful for inline styling once it replaces our container. */
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    options: {
      videoId: string;
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: YTPlayerState;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loaderPromise: Promise<YTNamespace> | null = null;

/**
 * Loads the YouTube IFrame Player API script once per page. Subsequent calls
 * resolve to the same `YT` namespace. Server-side render safe (returns a
 * rejected promise if called outside the browser; callers should guard).
 */
export function loadYouTubeAPI(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API not available in SSR"));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existingCb = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      existingCb?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error("YT API loaded but Player constructor missing"));
      }
    };

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load YouTube IFrame Player API"));
    };
    document.head.appendChild(tag);
  });
  return loaderPromise;
}
