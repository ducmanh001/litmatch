#!/usr/bin/env node
/**
 * PreToolUse guard — chặn cứng (deterministic) các hành vi cấm trong CLAUDE.md:
 *
 *   1. Tạo app thứ 4 trong apps/            → docs/03-architecture.md § 3.2
 *   2. `synchronize: true` (TypeORM)         → CLAUDE.md (cấm kể cả dev)
 *   3. Sửa/ghi đè/xoá migration đã commit    → migration là bất biến
 *   4. UPDATE/DELETE trên ledger_entries     → ledger append-only, docs/03 § 3.8.C
 *
 * Exit 2 = chặn tool call, stderr được trả về cho Claude làm lý do.
 * Exit 0 = cho qua. Khi nghi ngờ (không parse được input) thì cho qua,
 * không chặn bừa — guard này chỉ chặn pattern chắc chắn vi phạm.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ALLOWED_APPS = new Set([
  'core-api',
  'signaling-gateway',
  'media-server',
  'core-api-e2e',
  'signaling-gateway-e2e',
  'media-server-e2e',
]);

function isTrackedInGit(filePath) {
  try {
    execSync(`git ls-files --error-unmatch -- ${JSON.stringify(filePath)}`, {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0);
  }

  const tool = input.tool_name ?? '';
  const ti = input.tool_input ?? {};
  const deny = (msg) => {
    console.error(msg);
    process.exit(2);
  };

  if (tool === 'Bash') {
    const cmd = String(ti.command ?? '');
    if (/\b(rm|mv|rmdir)\b[^\n|;&]*\/migrations\//.test(cmd)) {
      deny(
        'BLOCKED (hook): xoá/di chuyển file trong thư mục migrations bị cấm — migration đã chạy là bất biến, sửa schema bằng migration MỚI. Nếu là migration vừa tạo chưa commit/chưa chạy và thực sự cần xoá: hỏi user thao tác tay.',
      );
    }
    process.exit(0);
  }

  if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

  const filePath = String(ti.file_path ?? '');
  const content =
    tool === 'Write' ? String(ti.content ?? '') : String(ti.new_string ?? '');
  const isCodeFile = /\.(ts|cts|mts|tsx|js|cjs|mjs|sql)$/.test(filePath);
  const isTestFile =
    /\.(spec|test)\.[cm]?[jt]s$/.test(filePath) ||
    /\/(test|tests|e2e|__tests__)\//.test(filePath);

  // ── Luật 1: chỉ 3 app deploy riêng ─────────────────────────────────────────
  const appMatch = filePath.match(/\/apps\/([^/]+)\//);
  if (appMatch && !ALLOWED_APPS.has(appMatch[1])) {
    deny(
      `BLOCKED (hook): tạo file trong apps/${appMatch[1]}/ vi phạm luật "chỉ 3 app deploy riêng" (core-api, signaling-gateway, media-server + *-e2e). Domain mới phải là module NestJS trong apps/core-api/src/modules/ — xem docs/03-architecture.md § 3.2. Nếu thực sự cần app thứ 4: dừng lại và hỏi user trước.`,
    );
  }

  if (isCodeFile) {
    // ── Cấm synchronize: true (TypeORM), kể cả dev ──────────────────────────
    if (/\bsynchronize\s*:\s*true\b/.test(content)) {
      deny(
        'BLOCKED (hook): `synchronize: true` bị cấm tuyệt đối (kể cả dev) — schema chỉ được đổi qua migration TypeORM (pnpm nx run core-api:migration-run). Xem CLAUDE.md.',
      );
    }

    // ── Ledger append-only: cấm mutate ledger_entries ngoài file test ───────
    if (!isTestFile) {
      const ledgerMutation = [
        /UPDATE\s+"?ledger_entries"?/i,
        /DELETE\s+FROM\s+"?ledger_entries"?/i,
        /TRUNCATE\s+(TABLE\s+)?"?ledger_entries"?/i,
        /\.(update|delete|remove|softDelete|softRemove)\s*\(\s*LedgerEntry\b/,
        /getRepository\s*\(\s*LedgerEntry\s*\)\s*\.\s*(update|delete|remove|softDelete|softRemove)\b/,
        /ledgerEntr\w*(Repo|Repository)\w*\s*\.\s*(update|delete|remove|softDelete|softRemove)\b/i,
      ];
      if (ledgerMutation.some((re) => re.test(content))) {
        deny(
          'BLOCKED (hook): phát hiện UPDATE/DELETE/TRUNCATE trên LedgerEntry/ledger_entries — ledger là append-only, sửa sai bằng bút toán đảo (reversal entry) MỚI, không đụng dòng cũ. Xem docs/03-architecture.md § 3.8.C. False-positive (vd job đối soát chỉ đọc)? Viết lại theo hướng append-only hoặc hỏi user.',
        );
      }
    }
  }

  // ── Migration bất biến: chặn Edit/ghi-đè migration đã commit vào git ──────
  // Migration mới tạo trong phiên (chưa commit) vẫn sửa được bình thường.
  if (/\/migrations\/[^/]+\.(ts|js|sql)$/.test(filePath)) {
    const overwriting = tool === 'Edit' || existsSync(filePath);
    if (overwriting && isTrackedInGit(filePath)) {
      deny(
        'BLOCKED (hook): sửa/ghi đè migration đã commit bị cấm — migration đã chạy trên môi trường khác là bất biến, tạo migration MỚI để sửa schema. (Migration chưa commit thì sửa thoải mái — file này đã nằm trong git.)',
      );
    }
  }

  process.exit(0);
});
