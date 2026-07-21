#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VALUES = Object.freeze({
  action: ['answer', 'inspect', 'change', 'review', 'incident'],
  risk: ['low', 'medium', 'high', 'critical'],
  uncertainty: ['low', 'medium', 'high'],
  context: ['small', 'medium', 'large'],
  changeSize: ['none', 'small', 'medium', 'large'],
  verification: ['light', 'standard', 'strict'],
});

const DEFAULTS = Object.freeze({
  action: 'change',
  workstreams: 1,
  risk: 'medium',
  uncertainty: 'medium',
  context: 'medium',
  changeSize: 'small',
  verification: 'standard',
});

const WEIGHTS = Object.freeze({
  risk: { low: 0, medium: 1, high: 3, critical: 5 },
  uncertainty: { low: 0, medium: 1, high: 2 },
  context: { small: 0, medium: 1, large: 2 },
  changeSize: { none: 0, small: 0, medium: 1, large: 2 },
  verification: { light: 0, standard: 1, strict: 2 },
});

const COMPLEXITY_RANK = Object.freeze({
  simple: 0,
  standard: 1,
  complex: 2,
  critical: 3,
});

function atLeast(current, minimum) {
  return COMPLEXITY_RANK[current] >= COMPLEXITY_RANK[minimum]
    ? current
    : minimum;
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input phải là một JSON object.');
  }

  const allowedKeys = new Set([...Object.keys(VALUES), 'workstreams']);
  const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(`Field không hỗ trợ: ${unknownKeys.join(', ')}.`);
  }

  const task = { ...DEFAULTS, ...input };
  for (const [field, values] of Object.entries(VALUES)) {
    if (!values.includes(task[field])) {
      throw new TypeError(`${field} phải là một trong: ${values.join(', ')}.`);
    }
  }

  if (
    !Number.isInteger(task.workstreams) ||
    task.workstreams < 1 ||
    task.workstreams > 4
  ) {
    throw new TypeError('workstreams phải là số nguyên từ 1 đến 4.');
  }

  return task;
}

function classify(task, score) {
  let complexity =
    score <= 2
      ? 'simple'
      : score <= 5
        ? 'standard'
        : score <= 9
          ? 'complex'
          : 'critical';

  if (task.risk === 'high' || task.verification === 'strict') {
    complexity = atLeast(complexity, 'complex');
  }
  if (task.risk === 'critical') complexity = 'critical';
  return complexity;
}

function makeWorker(task, complexity, maxWorkers) {
  const readOnly = ['answer', 'inspect', 'review'].includes(task.action);
  const review = task.action === 'review';
  return {
    role: review ? 'reviewer' : readOnly ? 'explorer' : 'worker',
    promptType: review
      ? 'counterexample-review'
      : readOnly
        ? 'evidence'
        : 'owned-implementation',
    count: Math.min(task.workstreams, maxWorkers),
    modelTier:
      readOnly && task.risk === 'low' && complexity !== 'critical'
        ? 'economy'
        : 'balanced',
    reasoningEffort: complexity === 'critical' ? 'high' : 'medium',
  };
}

export function routeTask(input) {
  const task = normalize(input);
  const score =
    WEIGHTS.risk[task.risk] +
    WEIGHTS.uncertainty[task.uncertainty] +
    WEIGHTS.context[task.context] +
    WEIGHTS.changeSize[task.changeSize] +
    WEIGHTS.verification[task.verification] +
    Math.max(0, task.workstreams - 1) +
    (task.action === 'incident' ? 1 : 0);
  const complexity = classify(task, score);
  const direct = ['simple', 'standard'].includes(complexity);
  const delegates = [];

  const independentReview =
    complexity === 'critical' ||
    task.risk === 'high' ||
    task.verification === 'strict';
  const agentCeiling =
    complexity === 'critical' ? 3 : complexity === 'complex' ? 2 : 0;
  if (!direct) {
    delegates.push(
      makeWorker(task, complexity, agentCeiling - (independentReview ? 1 : 0)),
    );
  }
  if (independentReview) {
    delegates.push({
      role: 'reviewer',
      promptType: 'counterexample-review',
      count: 1,
      modelTier: complexity === 'critical' ? 'frontier' : 'balanced',
      reasoningEffort: 'high',
    });
  }

  const agentCount = delegates.reduce((total, item) => total + item.count, 0);
  const strategy =
    agentCount === 0
      ? 'direct'
      : agentCount === 1
        ? 'single-delegate'
        : 'parallel-delegates';

  return {
    version: 1,
    complexity,
    score,
    strategy,
    agentCount,
    owner: {
      modelTier: 'current',
      reasoningEffort:
        complexity === 'simple'
          ? 'low'
          : complexity === 'standard'
            ? 'medium'
            : 'high',
      responsibilities: [
        'authority',
        'synthesis',
        'verification',
        'final-output',
      ],
    },
    delegates,
    quality: {
      independentReview,
      inspectIntegratedDiff: task.action === 'change',
      runApplicableChecks: task.action !== 'answer',
    },
    limits: {
      subAgentCeiling: agentCeiling,
      maxRetriesPerFailure: 2,
      polling: 'forbidden',
      logTailLines: 20,
      fullTestSuite: 'explicit-only',
    },
  };
}

function readCliInput(argument) {
  const value = argument === '-' ? readFileSync(0, 'utf8') : argument;
  if (!value) throw new TypeError('Thiếu JSON input.');
  return JSON.parse(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(routeTask(readCliInput(process.argv[2])), null, 2),
    );
  } catch (error) {
    console.error(`Adaptive orchestration router: ${error.message}`);
    process.exitCode = 1;
  }
}
