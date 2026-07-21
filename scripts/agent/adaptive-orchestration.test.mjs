import assert from 'node:assert/strict';
import test from 'node:test';

import { routeTask } from '../../.agents/skills/adaptive-orchestration/scripts/route-task.mjs';

test('task đơn giản chạy trực tiếp, không tốn sub-agent', () => {
  const route = routeTask({
    action: 'answer',
    workstreams: 1,
    risk: 'low',
    uncertainty: 'low',
    context: 'small',
    changeSize: 'none',
    verification: 'light',
  });

  assert.equal(route.complexity, 'simple');
  assert.equal(route.strategy, 'direct');
  assert.equal(route.agentCount, 0);
  assert.deepEqual(route.delegates, []);
});

test('task standard vẫn chạy trực tiếp để tránh overhead orchestration', () => {
  const route = routeTask({
    action: 'change',
    workstreams: 1,
    risk: 'medium',
    uncertainty: 'medium',
    context: 'medium',
    changeSize: 'small',
    verification: 'standard',
  });

  assert.equal(route.complexity, 'standard');
  assert.equal(route.strategy, 'direct');
  assert.equal(route.agentCount, 0);
});

test('điều tra read-only ít rủi ro fan-out bằng economy tier và cap hai agent', () => {
  const route = routeTask({
    action: 'inspect',
    workstreams: 4,
    risk: 'low',
    uncertainty: 'high',
    context: 'large',
    changeSize: 'none',
    verification: 'standard',
  });

  assert.equal(route.complexity, 'complex');
  assert.equal(route.strategy, 'parallel-delegates');
  assert.equal(route.agentCount, 2);
  assert.deepEqual(route.delegates[0], {
    role: 'explorer',
    promptType: 'evidence',
    count: 2,
    modelTier: 'economy',
    reasoningEffort: 'medium',
  });
});

test('strict high-risk change dùng worker balanced và reviewer frontier khi critical', () => {
  const route = routeTask({
    action: 'change',
    workstreams: 2,
    risk: 'high',
    uncertainty: 'high',
    context: 'large',
    changeSize: 'large',
    verification: 'strict',
  });

  assert.equal(route.complexity, 'critical');
  assert.equal(route.strategy, 'parallel-delegates');
  assert.equal(route.agentCount, 3);
  assert.equal(route.delegates[0].modelTier, 'balanced');
  assert.equal(route.delegates[1].role, 'reviewer');
  assert.equal(route.delegates[1].modelTier, 'frontier');
  assert.equal(route.quality.independentReview, true);
});

test('risk critical luôn ép route critical', () => {
  const route = routeTask({
    action: 'review',
    workstreams: 1,
    risk: 'critical',
    uncertainty: 'low',
    context: 'small',
    changeSize: 'none',
    verification: 'light',
  });

  assert.equal(route.complexity, 'critical');
  assert.equal(route.agentCount, 2);
  assert.equal(route.delegates.at(-1).modelTier, 'frontier');
});

test('complex high-risk giữ một worker và một reviewer trong cap hai', () => {
  const route = routeTask({
    action: 'change',
    workstreams: 3,
    risk: 'high',
    uncertainty: 'low',
    context: 'small',
    changeSize: 'small',
    verification: 'standard',
  });

  assert.equal(route.complexity, 'complex');
  assert.equal(route.agentCount, 2);
  assert.equal(route.delegates[0].count, 1);
  assert.equal(route.delegates[1].role, 'reviewer');
});

test('route luôn phát execution limits chống chảy máu token', () => {
  const route = routeTask({
    action: 'change',
    workstreams: 1,
    risk: 'medium',
    uncertainty: 'medium',
    context: 'medium',
    changeSize: 'small',
    verification: 'standard',
  });

  assert.deepEqual(route.limits, {
    subAgentCeiling: 0,
    maxRetriesPerFailure: 2,
    polling: 'forbidden',
    logTailLines: 20,
    fullTestSuite: 'explicit-only',
  });
});

test('từ chối field lạ để không nhận cả prompt hoặc dữ liệu người dùng', () => {
  assert.throws(
    () => routeTask({ prompt: 'không được truyền prompt vào router' }),
    /Field không hỗ trợ: prompt/u,
  );
  assert.throws(
    () => routeTask({ workstreams: 0 }),
    /workstreams phải là số nguyên từ 1 đến 4/u,
  );
});
