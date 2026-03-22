/** Reusable form field components for the Settings panel */

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <label className="text-sm text-ctp-subtext1 shrink-0">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-ctp-surface0 border border-ctp-surface1 rounded px-2 py-1 text-sm text-ctp-text outline-none focus:border-ctp-mauve max-w-[220px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <label className="text-sm text-ctp-subtext1 shrink-0">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        className="bg-ctp-surface0 border border-ctp-surface1 rounded px-2 py-1 text-sm text-ctp-text outline-none focus:border-ctp-mauve w-20 text-right"
      />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="shrink-0">
        <label className="text-sm text-ctp-subtext1">{label}</label>
        {description && <p className="text-xs text-ctp-overlay0 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-ctp-mauve" : "bg-ctp-surface1"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ctp-text transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="border-b border-ctp-surface0 py-4">
      <h3 className="text-sm font-medium text-ctp-text mb-2">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
