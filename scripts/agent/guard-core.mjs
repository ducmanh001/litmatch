export const ALLOWED_APPS = new Set([
  'core-api',
  'signaling-gateway',
  'media-server',
  'core-api-e2e',
  'signaling-gateway-e2e',
  'media-server-e2e',
  // Frontend client — không phải deployable backend thứ 4 (docs/12 § 12.1)
  'admin',
  'web',
]);

/** App frontend (docs/12) — có bộ rule riêng bên dưới, khác rule backend. */
export const FRONTEND_APPS = new Set(['admin', 'web']);

export function isTestFile(filePath) {
  return (
    /\.(spec|test)\.[cm]?[jt]sx?$/u.test(filePath) ||
    /\/(test|tests|e2e|__tests__)\//u.test(filePath)
  );
}

export function inspectCommand(command) {
  const violations = [];
  if (/\b(rm|mv|rmdir)\b[^\n|;&]*[\\/]migrations[\\/]/u.test(command)) {
    violations.push(
      'Không được xoá hoặc di chuyển migration; tạo migration mới để sửa schema.',
    );
  }
  return violations;
}

export function inspectChange({
  filePath = '',
  content = '',
  operation = 'write',
  tracked = false,
}) {
  const violations = [];
  const normalized = filePath.replaceAll('\\', '/');
  const appMatch = normalized.match(/(?:^|\/)apps\/([^/]+)(?:\/|$)/u);

  if (appMatch && !ALLOWED_APPS.has(appMatch[1])) {
    violations.push(
      `Không được tạo apps/${appMatch[1]}; domain mới phải nằm trong apps/core-api/src/modules/.`,
    );
  }

  const codeFile = /\.(ts|cts|mts|tsx|js|cjs|mjs|sql)$/u.test(normalized);
  const guardDefinition = normalized.endsWith('scripts/agent/guard-core.mjs');
  if (
    codeFile &&
    !isTestFile(normalized) &&
    !guardDefinition &&
    /\bsynchronize\s*:\s*true\b/u.test(content)
  ) {
    violations.push(
      'TypeORM synchronize: true bị cấm; schema chỉ đổi bằng migration.',
    );
  }

  if (codeFile && !isTestFile(normalized)) {
    const ledgerMutations = [
      /UPDATE\s+"?ledger_entries"?/iu,
      /DELETE\s+FROM\s+"?ledger_entries"?/iu,
      /TRUNCATE\s+(TABLE\s+)?"?ledger_entries"?/iu,
      /\.(update|delete|remove|softDelete|softRemove)\s*\(\s*LedgerEntry\b/u,
      /getRepository\s*\(\s*LedgerEntry\s*\)\s*\.\s*(update|delete|remove|softDelete|softRemove)\b/u,
      /ledgerEntr\w*(Repo|Repository)\w*\s*\.\s*(update|delete|remove|softDelete|softRemove)\b/iu,
    ];
    if (ledgerMutations.some((pattern) => pattern.test(content))) {
      violations.push(
        'Ledger append-only: sửa sai bằng reversal entry mới, không mutate dòng cũ.',
      );
    }
  }

  if (
    /\/migrations\/[^/]+\.(ts|js|sql)$/u.test(normalized) &&
    tracked &&
    operation !== 'create'
  ) {
    violations.push(
      'Migration đã commit là bất biến; tạo migration mới thay vì sửa/xoá.',
    );
  }

  // ── Rule riêng cho frontend app (enforce docs/12 § 12.9 + docs/13 bằng máy) ──
  // File config build-time (vite/next/postcss...) không phải code bundle — miễn rule env
  const isBuildConfig =
    /\/[^/]+\.config\.[cm]?[jt]s$/u.test(normalized) ||
    /\.d\.ts$/u.test(normalized);
  const isFrontendFile =
    appMatch &&
    FRONTEND_APPS.has(appMatch[1]) &&
    codeFile &&
    !isTestFile(normalized) &&
    !isBuildConfig;
  if (isFrontendFile) {
    const isEnvModule = /\/shared\/env\.ts$/u.test(normalized);
    if (!isEnvModule && /import\.meta\.env|process\.env/u.test(content)) {
      violations.push(
        'FE chỉ đọc env qua src/shared/env.ts (docs/13 § 13.10); không đọc import.meta.env/process.env rải rác.',
      );
    }
    if (
      /from\s+['"]axios['"]|\bnew\s+XMLHttpRequest\b|\bfetch\s*\(/u.test(
        content,
      )
    ) {
      violations.push(
        'Mọi REST call của FE đi qua @litmatch/api-client (docs/12 § 12.3); không fetch/axios tay.',
      );
    }
    if (/from\s+['"]@litmatch\/common-dtos['"]/u.test(content)) {
      violations.push(
        "FE import '@litmatch/common-dtos/pure' (entry thuần), không import entry chính — kéo class-validator vào bundle (docs/12 § 12.3).",
      );
    }
    if (
      /from\s+['"][^'"]*apps\/core-api/u.test(content) ||
      /from\s+['"]\.\..*core-api/u.test(content)
    ) {
      violations.push(
        'FE không import từ apps/core-api — hợp đồng đi qua @litmatch/api-client (docs/12 § 12.9).',
      );
    }
  }

  return violations;
}
