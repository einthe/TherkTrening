"use client";
import { label, type PainReading } from "@/lib/domain/events";

export function PainSliders({
  readings,
  onChange,
  disabled = false,
}: {
  readings: PainReading[];
  onChange: (readings: PainReading[]) => void;
  disabled?: boolean;
}) {
  return readings.map((reading, index) => (
    <div className="pain-target" key={reading.injuryId}>
      <div className="pain-value">
        <span>{label(reading.injuryId)}</span>
        <div>
          <strong>{reading.painLevel}</strong>
          <span> / 10</span>
        </div>
      </div>
      <input
        disabled={disabled}
        className="pain-slider"
        style={
          { "--progress": `${reading.painLevel * 10}%` } as React.CSSProperties
        }
        aria-label={`${label(reading.injuryId)} pain level`}
        aria-valuetext={`${reading.painLevel} out of 10`}
        type="range"
        min="0"
        max="10"
        step="1"
        value={reading.painLevel}
        onChange={(e) =>
          onChange(
            readings.map((r, i) =>
              i === index ? { ...r, painLevel: Number(e.target.value) } : r,
            ),
          )
        }
      />
      <div className="range-labels">
        <span>0 · No pain</span>
        <span>10 · Severe</span>
      </div>
    </div>
  ));
}
