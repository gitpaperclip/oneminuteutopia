'use client';

export type DemoStep = 'photo' | 'identify' | 'packet' | 'cluster';

const STEPS: { id: DemoStep; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'identify', label: 'AI identify' },
  { id: 'packet', label: 'Prepare packet' },
  { id: 'cluster', label: 'Cluster' },
];

export function DemoStepRail({ active }: { active: DemoStep }) {
  const activeIndex = STEPS.findIndex((s) => s.id === active);

  return (
    <nav className="demo-rail" aria-label="Demo flow">
      <ol className="demo-rail-list">
        {STEPS.map((step, index) => {
          const state =
            index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';
          return (
            <li key={step.id} className={`demo-rail-item demo-rail-${state}`}>
              <span className="demo-rail-dot" aria-hidden="true" />
              <span className="demo-rail-label">{step.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="demo-rail-note">Prepare-only — never city submit</p>
    </nav>
  );
}
