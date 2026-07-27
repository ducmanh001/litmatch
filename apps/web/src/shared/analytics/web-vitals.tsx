'use client';

import { useReportWebVitals } from 'next/web-vitals';

import { captureProductWebVital } from './product-analytics';

import type { ProductWebVital } from './product-analytics';

type ReportWebVitals = Parameters<typeof useReportWebVitals>[0];

// Callback ở module scope để Next không report lại metrics đã có khi component re-render.
const reportWebVitals: ReportWebVitals = (metric) => {
  captureProductWebVital(metric as ProductWebVital);
};

export function WebVitals() {
  useReportWebVitals(reportWebVitals);
  return null;
}
