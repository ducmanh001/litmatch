import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import cloudflareNode from '@opennextjs/aws/overrides/wrappers/cloudflare-node.js';
import type { ResolveConfigFn } from '@microlabs/otel-cf-workers';
import type { WrapperHandler } from '@opennextjs/aws/types/overrides.js';
import type { Wrapper } from '@opennextjs/aws/types/overrides.js';

interface WorkerEnv extends Record<string, unknown> {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_TRACES_SAMPLER_ARG?: string;
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

const resolveOtelConfig: ResolveConfigFn<WorkerEnv> = (env) => {
  const configuredEndpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const endpoint = configuredEndpoint
    ? resolveTraceEndpoint(configuredEndpoint)
    : undefined;

  return endpoint
    ? {
        exporter: {
          url: endpoint,
          headers: parseOtelHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
        },
        service: { name: 'litmatch-web' },
        sampling: {
          headSampler: {
            ratio: resolveSampleRatio(env.OTEL_TRACES_SAMPLER_ARG),
            acceptRemote: true,
          },
        },
      }
    : { spanProcessors: [], service: { name: 'litmatch-web' } };
};

/**
 * OpenNext owns the actual request handler. Adapt its Cloudflare wrapper to the Worker handler
 * shape expected by Microlabs so traces cover the generated Next request path as well.
 */
const otelCloudflareWrapper: WrapperHandler = async (handler, converter) => {
  const openNextHandler = await cloudflareNode.wrapper(handler, converter);
  const { instrument } = await import('@microlabs/otel-cf-workers');
  const instrumentedHandler = instrument<WorkerEnv, unknown, WorkerContext>(
    {
      fetch: (request: Request, env: WorkerEnv, ctx: WorkerContext) =>
        openNextHandler(request, env, ctx, request.signal),
    },
    resolveOtelConfig,
  );

  return instrumentedHandler.fetch;
};

const otelCloudflareWrapperOverride = (): Wrapper => ({
  name: 'otel-cloudflare-node',
  wrapper: otelCloudflareWrapper,
  supportStreaming: true,
});

const cloudflareConfig = defineCloudflareConfig();

export default {
  ...cloudflareConfig,
  cloudflare: {
    ...cloudflareConfig.cloudflare,
    // Required because the adapter validator only accepts built-in wrapper names.
    dangerousDisableConfigValidation: true,
  },
  edgeExternals: [
    ...(cloudflareConfig.edgeExternals ?? []),
    'node:stream',
    'cloudflare:workers',
    '@microlabs/otel-cf-workers',
  ],
  default: {
    ...cloudflareConfig.default,
    override: {
      ...cloudflareConfig.default.override,
      // Keep OpenNext's streaming/abort behavior and add OTel at the outer Worker boundary.
      // OpenNext resolves this lazy override and expects the returned { name, wrapper } object.
      wrapper: otelCloudflareWrapperOverride,
    },
  },
};

function resolveTraceEndpoint(configured: string): string | undefined {
  try {
    const url = new URL(configured);
    const pathname = url.pathname.replace(/\/+$/u, '');
    if (pathname.endsWith('/v1/traces')) return url.toString();
    url.pathname = `${pathname}/v1/traces`;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseOtelHeaders(value: string | undefined): Record<string, string> {
  if (!value) return {};

  return Object.fromEntries(
    value.split(',').flatMap((entry) => {
      const separator = entry.indexOf('=');
      if (separator <= 0) return [];
      return [
        [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()],
      ];
    }),
  );
}

function resolveSampleRatio(value: string | undefined): number {
  const ratio = Number(value ?? '1');
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 1;
}
