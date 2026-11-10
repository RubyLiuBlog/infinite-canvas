import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Camera, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CanvasVideoPlayer({ nodeId, src, scale, onCapture }: { nodeId: string; src: string; scale: number; onCapture: () => void }) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const pressRef = useRef<{ x: number; y: number } | null>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    useEffect(() => {
        setPlaying(false);
        setMuted(false);
        setDuration(0);
        setCurrentTime(0);
    }, [src]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
    };

    const toggleMute = () => {
        setMuted((value) => !value);
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void containerRef.current?.requestFullscreen().catch(() => undefined);
    };

    const handleVideoClick = (event: MouseEvent<HTMLVideoElement>) => {
        const press = pressRef.current;
        pressRef.current = null;
        // Dragging the node starts with the same mousedown, so skip the toggle when the pointer moved.
        if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) return;
        togglePlay();
    };

    const seek = (time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
    };

    return (
        <div ref={containerRef} className={`group/player relative h-full w-full overflow-hidden bg-black ${fullscreen ? "" : "rounded-[18px]"}`} data-canvas-no-zoom>
            <video
                ref={videoRef}
                src={src}
                muted={muted}
                preload="metadata"
                playsInline
                data-canvas-video={nodeId}
                className="h-full w-full object-contain"
                onMouseDown={(event) => {
                    pressRef.current = { x: event.clientX, y: event.clientY };
                }}
                onClick={handleVideoClick}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            />

            <div
                className={`absolute bottom-0 left-0 flex items-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-8 text-white transition-opacity duration-150 ${playing ? "pointer-events-none opacity-0 group-hover/player:pointer-events-auto group-hover/player:opacity-100" : "opacity-100"}`}
                style={{ width: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "bottom left" }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
            >
                <PlayerButton label={t(playing ? "canvas.videoPlayer.pause" : "canvas.videoPlayer.play")} onClick={togglePlay}>
                    {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </PlayerButton>

                <span className="shrink-0 text-[11px] tabular-nums opacity-80">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step="any"
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(event) => seek(Number(event.target.value))}
                    className="min-w-0 flex-1 cursor-pointer accent-white"
                    aria-label={t("canvas.videoPlayer.progress")}
                />

                <PlayerButton label={t(muted ? "canvas.videoPlayer.unmute" : "canvas.videoPlayer.mute")} onClick={toggleMute}>
                    {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </PlayerButton>

                <PlayerButton label={t("canvas.videoFrames.current")} onClick={onCapture}>
                    <Camera className="size-3.5" />
                </PlayerButton>

                <PlayerButton label={t(fullscreen ? "canvas.videoPlayer.exitFullscreen" : "canvas.videoPlayer.fullscreen")} onClick={toggleFullscreen}>
                    {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
                </PlayerButton>
            </div>
        </div>
    );
}

function PlayerButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} className="grid size-7 shrink-0 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white" onClick={() => onClick()}>
            {children}
        </button>
    );
}

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
