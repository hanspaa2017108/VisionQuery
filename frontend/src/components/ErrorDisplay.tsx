"use client";

interface ErrorDisplayProps {
  error: string | null;
  onDismiss?: () => void;
}

export default function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="mt-3 p-3 border border-rose-300 bg-rose-50 rounded-[10px] text-rose-800 flex justify-between items-start gap-2">
      <span>{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-400 hover:text-rose-600 cursor-pointer text-sm">
          &times;
        </button>
      )}
    </div>
  );
}
