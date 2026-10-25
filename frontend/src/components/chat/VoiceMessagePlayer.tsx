import { useEffect, useRef, useState } from 'react';
import { AudioLines, Pause, Play, RotateCcw, RotateCw, Volume2 } from 'lucide-react';

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

const WAVEFORM = [
  5, 9, 13, 7, 16, 10, 6, 19, 12, 8, 15, 22, 11, 7, 17, 25, 13, 9, 19, 12,
  6, 15, 23, 10, 18, 27, 14, 8, 20, 12, 6, 16, 24, 11, 18, 9, 21, 13, 7, 16,
  25, 12, 8, 19, 14, 6, 17, 10, 22, 13, 7, 18, 11, 5,
];

/** Telegram-inspired voice note player with a seekable waveform and playback speed control. */
export default function VoiceMessagePlayer({ src, fileName, mine = false }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  /* oxlint-disable react-hooks/set-state-in-effect -- Reset playback state when the media source changes. */
  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setFailed(false);
    setSpeed(1);
  }, [src]);
  /* oxlint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setFailed(true);
      }
    } else {
      audio.pause();
    }
  };

  const seekBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio || !duration || failed) return;
    const next = Math.max(0, Math.min(duration, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const title = failed
    ? 'Аудио недоступно'
    : fileName?.startsWith('voice-message') || !fileName
      ? 'Голосовое сообщение'
      : fileName;

  return (
    <div className={`my-1 w-full min-w-[230px] max-w-[360px] overflow-hidden rounded-[20px] border shadow-sm transition-colors ${mine ? 'border-white/15 bg-gradient-to-br from-white/[0.13] to-black/[0.12]' : 'border-white/[0.08] bg-gradient-to-br from-slate-900/80 to-slate-950/70'}`}>
      <audio
        key={src}
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
      <div className="flex items-center gap-3 px-3.5 pb-1 pt-3.5">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          disabled={failed}
          aria-label={playing ? 'Приостановить голосовое сообщение' : 'Воспроизвести голосовое сообщение'}
          title={playing ? 'Пауза' : 'Воспроизвести'}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-lg transition duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${mine ? 'bg-white text-slate-950 shadow-black/15' : 'bg-accent text-white shadow-accent/20'}`}
        >
          {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <AudioLines size={14} className={`shrink-0 ${mine ? 'text-white/80' : 'text-accent'}`} />
            <span className="truncate text-xs font-semibold text-t-primary">{title}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-t-secondary">
            <span className="font-mono tabular-nums">{formatDuration(currentTime)}</span>
            <span className="opacity-40">/</span>
            <span className="font-mono tabular-nums">{formatDuration(duration)}</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/10 px-1.5 py-0.5">
              <Volume2 size={11} />
              {speed}×
            </span>
          </div>
        </div>
      </div>
      <div className="px-3.5 pb-3 pt-1">
        <div className="relative flex h-8 items-center gap-[2px]" aria-label="Волновая форма аудио">
          {WAVEFORM.map((height, index) => {
            const played = (index / WAVEFORM.length) * 100 <= progress;
            return (
              <span
                key={index}
                className={`min-w-[2px] flex-1 rounded-full transition-colors duration-100 ${played ? (mine ? 'bg-white' : 'bg-accent') : 'bg-current opacity-20'}`}
                style={{ height: `${height}px` }}
              />
            );
          })}
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
            title="Переместиться по голосовому сообщению"
            className="absolute inset-x-0 top-1/2 h-8 w-full -translate-y-1/2 cursor-pointer opacity-[0.015] disabled:cursor-default"
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => seekBy(-10)} disabled={!duration || failed} aria-label="Назад на 10 секунд" title="Назад на 10 секунд" className="rounded-lg p-1.5 text-t-secondary transition hover:bg-white/[0.07] hover:text-t-primary disabled:opacity-30"><RotateCcw size={13} /></button>
            <button type="button" onClick={() => seekBy(10)} disabled={!duration || failed} aria-label="Вперёд на 10 секунд" title="Вперёд на 10 секунд" className="rounded-lg p-1.5 text-t-secondary transition hover:bg-white/[0.07] hover:text-t-primary disabled:opacity-30"><RotateCw size={13} /></button>
          </div>
          <button
            type="button"
            onClick={() => setSpeed((value) => value === 1 ? 1.5 : value === 1.5 ? 2 : 1)}
            disabled={failed}
            aria-label="Изменить скорость воспроизведения"
            title="Скорость воспроизведения"
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition hover:bg-white/[0.08] disabled:opacity-30 ${mine ? 'text-white/80' : 'text-accent'}`}
          >
            Скорость {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}
