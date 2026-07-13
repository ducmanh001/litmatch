import { startTracing } from '@litmatch/observability';

// PHẢI là file được import ĐẦU TIÊN trong main.ts (trước mọi import khác) — xem giải thích đầy
// đủ trong libs/observability/src/lib/tracing.ts.
startTracing({ serviceName: 'signaling-gateway' });
