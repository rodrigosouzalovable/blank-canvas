import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppAudioPlayerProps {
  src: string;
  isSaida: boolean;
  messageId: string;
  mimeType?: string;
}

function seededRandom(seed: number) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateWaveform(messageId: string, bars: number = 40): number[] {
  let seed = 0;
  for (let i = 0; i < messageId.length; i++) {
    seed += messageId.charCodeAt(i) * (i + 1);
  }
  return Array.from({ length: bars }, (_, i) => {
    const r = seededRandom(seed + i * 7);
    return 4 + r * 20; // heights between 4 and 24
  });
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function WhatsAppAudioPlayer({ src, isSaida, messageId, mimeType }: WhatsAppAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [waveform] = useState(() => generateWaveform(messageId));
  const progressContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    if (mimeType) {
      const source = document.createElement('source');
      source.src = src;
      source.type = mimeType;
      audio.appendChild(source);
    } else {
      audio.src = src;
    }
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
    };
  }, [src, mimeType]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = progressContainerRef.current;
    const audio = audioRef.current;
    if (!container || !audio || !duration) return;
    const rect = container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[280px]">
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
          isSaida
            ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
            : "bg-muted text-foreground hover:bg-muted/80"
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 min-w-0">
        <div
          ref={progressContainerRef}
          className="flex items-center gap-[2px] h-7 cursor-pointer"
          onClick={seek}
        >
          {waveform.map((h, i) => {
            const barProgress = i / waveform.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-colors duration-100",
                  isPlayed
                    ? isSaida
                      ? "bg-primary-foreground/90"
                      : "bg-primary"
                    : isSaida
                      ? "bg-primary-foreground/30"
                      : "bg-muted-foreground/30"
                )}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <span className={cn(
            "text-[10px]",
            isSaida ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>

          <button
            onClick={cycleSpeed}
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors",
              isSaida
                ? "bg-primary-foreground/20 text-primary-foreground/80 hover:bg-primary-foreground/30"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
