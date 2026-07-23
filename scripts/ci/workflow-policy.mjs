const requiredTriggers = ['pull_request', 'merge_group', 'workflow_dispatch'];
const requiredFrontendBuildVariables = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_LIVEKIT_URL',
];

function hasTopLevelTrigger(workflow, trigger) {
  return new RegExp(`^  ${trigger}:`, 'mu').test(workflow);
}

function unpinnedRemoteActions(workflow) {
  return [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+).*$/gmu)]
    .map(([, reference]) => reference)
    .filter((reference) => !reference.startsWith('./'))
    .filter((reference) => !/@[0-9a-f]{40}$/u.test(reference));
}

export function workflowPolicyErrors({ ciWorkflow, securityWorkflow }) {
  const errors = [];
  const workflows = [['CI', ciWorkflow]];

  for (const [name, workflow] of workflows) {
    for (const trigger of requiredTriggers) {
      if (!hasTopLevelTrigger(workflow, trigger)) {
        errors.push(`${name} workflow thiếu trigger ${trigger}.`);
      }
    }

    for (const reference of unpinnedRemoteActions(workflow)) {
      errors.push(
        `${name} workflow phải pin action bằng commit SHA 40 ký tự: ${reference}.`,
      );
    }
  }

  if (!ciWorkflow.includes('name: CI required')) {
    errors.push('CI workflow thiếu check tổng hợp ổn định `CI required`.');
  }
  if (!ciWorkflow.includes('pnpm ci:local:quick')) {
    errors.push(
      'CI quality job phải dùng local-equivalent `pnpm ci:local:quick`.',
    );
  }
  for (const variable of requiredFrontendBuildVariables) {
    if (!new RegExp(`^  ${variable}:\\s+\\S+`, 'mu').test(ciWorkflow)) {
      errors.push(`CI workflow thiếu biến build frontend ${variable}.`);
    }
  }
  const disabledSecurityWorkflow =
    typeof securityWorkflow === 'string' &&
    /security workflow intentionally disabled/u.test(securityWorkflow);

  if (typeof securityWorkflow === 'string' && !disabledSecurityWorkflow) {
    if (!securityWorkflow.includes('name: Security required')) {
      errors.push(
        'Security workflow thiếu check tổng hợp ổn định `Security required`.',
      );
    }
    if (
      !/actions\/dependency-review-action@[0-9a-f]{40}/u.test(securityWorkflow)
    ) {
      errors.push(
        'Security workflow thiếu dependency review action đã pin SHA.',
      );
    }
    if (!/fail-on-severity:\s+high/u.test(securityWorkflow)) {
      errors.push('Dependency review phải chặn dependency mới từ mức high.');
    }
  }

  return errors;
}
