import { ConnectionAdmissionBudget } from './connection-admission-budget';

describe('ConnectionAdmissionBudget', () => {
  it('bounds authenticated plus pending connections without a queue', () => {
    const budget = new ConnectionAdmissionBudget(2, 2);
    const first = budget.reserve()!;
    first.finishHandshake();
    const second = budget.reserve()!;
    expect(budget.reserve()).toBeUndefined();
    expect(budget.connections).toBe(2);
    expect(budget.pendingHandshakes).toBe(1);
    first.releaseConnection();
    expect(budget.reserve()).toBeDefined();
    second.releaseConnection();
  });

  it('does not free asynchronous work capacity when its transport closes', () => {
    const budget = new ConnectionAdmissionBudget(2, 1);
    const first = budget.reserve()!;
    first.releaseConnection();
    expect(budget.connections).toBe(0);
    expect(budget.reserve()).toBeUndefined();
    first.finishHandshake();
    first.finishHandshake();
    expect(budget.reserve()).toBeDefined();
  });

  it('closes permanently and tolerates late cleanup after shutdown', () => {
    const budget = new ConnectionAdmissionBudget(2, 2);
    const first = budget.reserve()!;
    budget.close();
    expect(first.active).toBe(false);
    first.releaseConnection();
    first.finishHandshake();
    expect(budget.connections).toBe(0);
    expect(budget.pendingHandshakes).toBe(0);
    expect(budget.reserve()).toBeUndefined();
  });
});
