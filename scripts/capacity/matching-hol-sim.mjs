#!/usr/bin/env node
/**
 * Mô phỏng head-of-line blocking của matcher (docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 3).
 *
 *   node scripts/capacity/matching-hol-sim.mjs
 *   node scripts/capacity/matching-hol-sim.mjs --pAny=0.7 --pOpp=0.28 --lambda=2
 *
 * Một shard, tick 1 giây, tối đa 20 cặp/tick, ticket hết hạn sau 120 giây (MATCHING_QUEUE_MAX_WAIT_SECONDS).
 * Mỗi tick matcher xét `window` ticket đầu hàng đợi: `window = 2` là bản cũ (chỉ cặp 2 ticket đầu), lớn hơn
 * là cửa sổ ứng viên (ticket cũ nhất ghép với đối tác tương thích đầu tiên trong cửa sổ).
 *
 * Phân bố giới tính/preference là GIẢ ĐỊNH — thay bằng số liệu thật của sản phẩm trước khi kết luận.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPIRE_SECONDS = 120;
const BATCH_PAIRS = 20;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, random) {
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = 1;
  do {
    count += 1;
    product *= random();
  } while (product > limit);
  return count - 1;
}

const allows = (preference, selfGender, otherGender) =>
  preference === 'any' ||
  (preference === 'opposite'
    ? selfGender !== otherGender
    : selfGender === otherGender);
const compatible = (a, b) =>
  allows(a.preference, a.gender, b.gender) &&
  allows(b.preference, b.gender, a.gender);

export function simulate({
  window,
  lambda,
  seconds = 3600,
  seed = 7,
  pMale = 0.5,
  pAny = 0.3,
  pOpposite = 0.65,
  unlimitedWindow = false,
}) {
  const random = mulberry32(seed);
  const queue = [];
  const waits = [];
  let arrived = 0;
  let expired = 0;
  for (let second = 0; second < seconds; second += 1) {
    for (let index = poisson(lambda, random); index > 0; index -= 1) {
      const gender = random() < pMale ? 'M' : 'F';
      const roll = random();
      const preference =
        roll < pAny ? 'any' : roll < pAny + pOpposite ? 'opposite' : 'same';
      queue.push({ at: second, gender, preference });
      arrived += 1;
    }
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (second - queue[index].at >= EXPIRE_SECONDS) {
        queue.splice(index, 1);
        expired += 1;
      }
    }
    for (let pairs = 0; pairs < BATCH_PAIRS; pairs += 1) {
      const size = unlimitedWindow
        ? queue.length
        : Math.min(window, queue.length);
      let found;
      for (let i = 0; i < size && !found; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          if (compatible(queue[i], queue[j])) {
            found = [i, j];
            break;
          }
        }
      }
      if (!found) break; // `stalled` — cửa sổ đầu hàng đợi không có cặp hợp lệ
      const [i, j] = found;
      waits.push(second - queue[i].at, second - queue[j].at);
      queue.splice(j, 1);
      queue.splice(i, 1);
    }
  }
  waits.sort((a, b) => a - b);
  const quantile = (q) =>
    waits.length
      ? waits[Math.min(waits.length - 1, Math.floor(waits.length * q))]
      : null;
  return {
    window: unlimitedWindow ? 'ideal' : window,
    lambda,
    arrived,
    matchedPct: arrived
      ? Number(((100 * waits.length) / arrived).toFixed(1))
      : 0,
    expiredPct: arrived ? Number(((100 * expired) / arrived).toFixed(1)) : 0,
    p50WaitSeconds: quantile(0.5),
    p95WaitSeconds: quantile(0.95),
  };
}

function main(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--(lambda|seconds|seed|pMale|pAny|pOpp)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Tham số không hợp lệ: ${arg}`);
    options[match[1] === 'pOpp' ? 'pOpposite' : match[1]] = Number(match[2]);
  }
  const lambdas = options.lambda === undefined ? [0.5, 2, 8] : [options.lambda];
  for (const lambda of lambdas) {
    console.log(`\nλ = ${lambda} ticket/giây vào một shard`);
    console.table(
      [2, 4, 8, 16, 32]
        .map((window) => simulate({ ...options, window, lambda }))
        .concat(
          simulate({ ...options, window: 0, lambda, unlimitedWindow: true }),
        ),
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
