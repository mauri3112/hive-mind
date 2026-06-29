interface WaveformProps {
  active: boolean;
}

export function Waveform({ active }: WaveformProps) {
  return (
    <div className={active ? "waveform active" : "waveform"} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span key={index} style={{ animationDelay: `${index * 54}ms` }} />
      ))}
    </div>
  );
}
