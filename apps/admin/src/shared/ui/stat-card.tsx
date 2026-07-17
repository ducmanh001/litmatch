import { Card } from './card';

import type { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  trend: string;
}

export function StatCard({ icon, label, value, trend }: StatCardProps) {
  return (
    <Card className="p-[17px_18px] transition-transform hover:-translate-y-[3px] hover:border-primary">
      <div className="mb-3.5 flex size-[34px] items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        {icon}
      </div>
      <div className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="mb-2 text-[22px] font-extrabold tracking-tight">
        {value}
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11.5px] font-extrabold text-success">
        {trend}
      </span>
    </Card>
  );
}
