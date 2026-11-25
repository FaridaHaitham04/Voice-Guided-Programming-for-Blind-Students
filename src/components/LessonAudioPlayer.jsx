import { useEffect, useRef, useState } from "react";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

function formatSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function LessonAudioPlayer({
  lesson,
  apiBase,
  onBeforePlay,
  onAnnounce,
}) {
  const audioRef = useRef(null);
  const [audioSrc, setAudioSrc] = useState(
    lesson?.audio_url || `/audio/lessons/${lesson?.id}.wav`
  );
  const [usedFallback, setUsedFallback] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1); // 1x default
  const [isMuted, setIsMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const playbackRate = SPEED_OPTIONS[speedIndex] ?? 1;

  // Reset player cleanly whenever the selected lesson changes
  useEffect(() => {
    const primary = lesson?.audio_url || `/audio/lessons/${lesson?.id}.wav`;
    setAudioSrc(primary);
    setUsedFallback(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(false);

    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
      el.playbackRate = playbackRate;
    }
  }, [lesson?.id, lesson?.audio_url]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el || audioError) return;

    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      onAnnounce?.(`Paused ${lesson.title} audio.`);
      return;
    }

    onBeforePlay?.();
    try {
      el.playbackRate = playbackRate;
      await el.play();
      setIsPlaying(true);
      onAnnounce?.(`Playing ${lesson.title} audio.`);
    } catch {
      setIsPlaying(false);
    }
  }

  function handleSeek(event) {
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  }

  function cycleSpeed() {
    const nextIdx = (speedIndex + 1) % SPEED_OPTIONS.length;
    setSpeedIndex(nextIdx);
    const nextRate = SPEED_OPTIONS[nextIdx];
    onAnnounce?.(`Lesson audio speed set to ${nextRate}x.`);
  }

  function toggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      onAnnounce?.(next ? "Lesson audio muted." : "Lesson audio unmuted.");
      return next;
    });
  }

  function restartAudio() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    setCurrentTime(0);
    onAnnounce?.(`Restarted ${lesson.title} audio from beginning.`);
  }

  function handleAudioError() {
    if (!usedFallback && lesson?.id && apiBase) {
      const fallbackUrl = `${apiBase}/api/lessons/${lesson.id}/audio`;
      if (audioSrc !== fallbackUrl) {
        setUsedFallback(true);
        setAudioSrc(fallbackUrl);
        return;
      }
    }
    setIsPlaying(false);
    setAudioError(true);
  }

  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const durationDisplay =
    duration > 0 ? formatSeconds(duration) : lesson?.duration_label || "0:00";

  return (
    <div
      className="lesson-audio-player"
      role="region"
      aria-label={`Audio recording for ${lesson?.title || "lesson"}`}
    >
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          e.currentTarget.playbackRate = playbackRate;
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        onEnded={() => {
          setIsPlaying(false);
          onAnnounce?.(`Finished ${lesson?.title || "lesson"} audio.`);
        }}
        onError={handleAudioError}
      />

      <button
        type="button"
        className="player-play-btn"
        onClick={togglePlay}
        disabled={audioError}
        aria-label={isPlaying ? "Pause lesson audio" : "Play lesson audio"}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5-9-5.5z" />
          </svg>
        )}
      </button>

      <span className="player-time" aria-live="off">
        {formatSeconds(currentTime)} / {durationDisplay}
      </span>

      <input
        type="range"
        className="player-seek"
        min={0}
        max={duration || 100}
        step={0.1}
        value={duration > 0 ? currentTime : 0}
        disabled={audioError || duration <= 0}
        onChange={handleSeek}
        style={{ "--progress": `${progressPct}%` }}
        aria-label="Seek lesson audio timeline"
      />

      <button
        type="button"
        className="player-speed-btn"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${playbackRate}x. Click to change.`}
        title="Change playback speed"
      >
        {playbackRate}x
      </button>

      <button
        type="button"
        className="player-icon-btn"
        onClick={toggleMute}
        aria-label={isMuted ? "Unmute audio" : "Mute audio"}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="player-icon-btn"
        onClick={restartAudio}
        disabled={audioError}
        aria-label="Restart lesson audio from beginning"
        title="Restart from beginning"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
    </div>
  );
}
