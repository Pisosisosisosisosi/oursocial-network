import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

interface VoiceMessagePlayerProps {
  src: string;
  fileName?: string;
  mine?: boolean;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Compact Telegram-inspired audio player for voice notes and audio attachments. */
export default function VoiceMessagePlayer({ src, fileName, mine = false }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFailed(false);
    if (audioRef.current) audioRef.current.load();
  }, [src]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setFailed(true);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const elapsedLabel = duration > 0 ? currentTime : 0;
  const waveform = [3, 7, 5, 10, 6, 13, 8, 5, 11, 15, 7, 4, 9, 13, 6, 10, 16, 8, 5, 12, 7, 14, 9, 4, 11, 6, 15, 8, 5, 12, 7, 10, 4, 14, 8, 6, 11, 5, 13, 7];

  return (
    <div className={`my-1 flex w-full min-w-[220px] max-w-[320px] items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm ${mine ? 'border-white/10 bg-black/10' : 'border-white/[0.07] bg-slate-950/35'}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onError={() => setFailed(true)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={failed}
        aria-label={playing ? 'Приостановить голосовое сообщение' : 'Воспроизвести голосовое сообщение'}
        title={playing ? 'Пауза' : 'Воспроизвести'}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-md transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 ${mine ? 'bg-white text-slate-950' : 'bg-accent text-white'}`}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold text-t-primary">
            <Volume2 size={13} className="shrink-0 opacity-70" />
            <span className="truncate">{failed ? 'Аудио недоступно' : fileName?.startsWith('voice-message') ? 'Голосовое сообщение' : fileName || 'Голосовое сообщение'}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-t-secondary">{formatDuration(elapsedLabel)}<span className="opacity-50"> / </span>{formatDuration(duration)}</span>
        </div>
        <div className="flex h-6 items-center gap-[2px]" aria-hidden="true">
          {waveform.map((height, index) => (
            <span
              key={index}
              className={`min-w-[2px] flex-1 rounded-full transition-colors ${duration > 0 && (index / waveform.length) * 100 <= progress ? (mine ? 'bg-white' : 'bg-accent') : 'bg-current opacity-25'}`}
              style={{ height: `${height}px` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          disabled={!duration || failed}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (audioRef.current) audioRef.current.currentTime = next;
            setCurrentTime(next);
          }}
          aria-label="Позиция воспроизведения"
          className="mt-1 block h-1 w-full cursor-pointer accent-current disabled:cursor-default"
          style={{ color: mine ? 'white' : 'var(--accent, #34d399)' }}
        />
      </div>
    </div>
  );
}
