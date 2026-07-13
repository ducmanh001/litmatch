import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';

import { withSpan } from './traced';

describe('withSpan', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    trace.disable();
    await provider.shutdown();
  });

  it('tạo span tên đúng, status OK khi fn thành công, trả về đúng kết quả', async () => {
    const result = await withSpan(
      'litmatch-test',
      'matching.matcher.tick',
      async (span) => {
        span.setAttribute('matched', 2);
        return 'ok-value';
      },
    );

    expect(result).toBe('ok-value');
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('matching.matcher.tick');
    expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    expect(spans[0].attributes['matched']).toBe(2);
  });

  it('fn throw → span ghi exception + status ERROR, lỗi vẫn propagate ra ngoài', async () => {
    await expect(
      withSpan('litmatch-test', 'calling.ticker.tick', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].status.message).toBe('boom');
    expect(spans[0].events.some((e) => e.name === 'exception')).toBe(true);
  });
});
