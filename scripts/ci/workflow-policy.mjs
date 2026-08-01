import { parse as parseYaml } from 'yaml';

const requiredTriggers = ['pull_request', 'merge_group', 'workflow_dispatch'];
const requiredFrontendBuildVariables = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_SOCKET_URL',
  'NEXT_PUBLIC_LIVEKIT_URL',
];

function nxCommandsMissingStaticOutput(workflow) {
  return workflow
    .split('\n')
    .filter((line) => /\bpnpm nx\b/u.test(line))
    .filter((line) => !line.includes('--outputStyle=static'));
}

function hasTopLevelTrigger(workflow, trigger) {
  return new RegExp(`^  ${trigger}:`, 'mu').test(workflow);
}

function unpinnedRemoteActions(workflow) {
  return [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+).*$/gmu)]
    .map(([, reference]) => reference)
    .filter((reference) => !reference.startsWith('./'))
    .filter((reference) => !/@[0-9a-f]{40}$/u.test(reference));
}

function parseWorkflow(name, source, errors) {
  try {
    return parseYaml(source);
  } catch (error) {
    errors.push(
      `${name} workflow YAML không hợp lệ: ${
        error instanceof Error ? error.message : error
      }.`,
    );
    return undefined;
  }
}

function normalizedJobNeeds(job) {
  if (typeof job?.needs === 'string') return [job.needs];
  if (Array.isArray(job?.needs)) return job.needs;
  return [];
}

function hasExactJobNeeds(job, expectedNeeds) {
  const actualNeeds = normalizedJobNeeds(job);
  return (
    actualNeeds.length === expectedNeeds.length &&
    expectedNeeds.every((need) => actualNeeds.includes(need))
  );
}

export function workflowPolicyErrors({
  ciWorkflow,
  hostedReleaseWorkflow,
  securityWorkflow,
}) {
  const errors = [];
  const workflows = [
    ['CI', ciWorkflow],
    ['Hosted release', hostedReleaseWorkflow],
  ];

  for (const [name, workflow] of workflows) {
    if (typeof workflow !== 'string') {
      errors.push(`${name} workflow không tồn tại.`);
      continue;
    }
    for (const trigger of requiredTriggers) {
      if (name !== 'CI') continue;
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

  if (typeof ciWorkflow !== 'string') return errors;
  const ciConfig = parseWorkflow('CI', ciWorkflow, errors);
  if (!ciConfig) return errors;

  if (ciConfig.jobs?.required?.name !== 'CI required') {
    errors.push('CI workflow thiếu check tổng hợp ổn định `CI required`.');
  }
  if (!hasExactJobNeeds(ciConfig.jobs?.quality, [])) {
    errors.push(
      'CI quality job phải là prerequisite đầu tiên, không có `needs`.',
    );
  }
  if (!hasExactJobNeeds(ciConfig.jobs?.test, ['quality'])) {
    errors.push('CI test job phải chỉ phụ thuộc `quality`.');
  }
  if (!hasExactJobNeeds(ciConfig.jobs?.docker, ['quality'])) {
    errors.push(
      'CI docker job phải chỉ phụ thuộc `quality` để chạy song song với test.',
    );
  }
  if (
    !hasExactJobNeeds(ciConfig.jobs?.required, ['quality', 'test', 'docker'])
  ) {
    errors.push(
      'CI required job phải phụ thuộc đầy đủ `quality`, `test` và `docker`.',
    );
  }
  if (
    /^\s*bypass_ci:/mu.test(ciWorkflow) ||
    /\b(?:LITMATCH_CI_BYPASS|CI_BYPASS)\b/u.test(ciWorkflow) ||
    /(?:^|\s)--bypass(?:\s|$)/mu.test(ciWorkflow)
  ) {
    errors.push(
      'CI workflow không được có bypass làm check `CI required` xanh mà bỏ qua gate.',
    );
  }
  const ciQualityCommands = (ciConfig.jobs?.quality?.steps ?? [])
    .map((step) => step?.run)
    .filter((command) => typeof command === 'string');
  if (
    !ciQualityCommands.some((command) =>
      command.includes('pnpm ci:local:quick'),
    )
  ) {
    errors.push(
      'CI quality job phải dùng local-equivalent `pnpm ci:local:quick`.',
    );
  }
  for (const variable of requiredFrontendBuildVariables) {
    if (!String(ciConfig.env?.[variable] ?? '').trim()) {
      errors.push(`CI workflow thiếu biến build frontend ${variable}.`);
    }
  }

  if (typeof hostedReleaseWorkflow !== 'string') return errors;
  const hostedConfig = parseWorkflow(
    'Hosted release',
    hostedReleaseWorkflow,
    errors,
  );
  if (!hostedConfig) return errors;
  const hostedDeploy = hostedConfig.jobs?.deploy;
  const hostedCondition = String(hostedDeploy?.if ?? '');
  const hostedCommands = (hostedDeploy?.steps ?? [])
    .map((step) => step?.run)
    .filter((command) => typeof command === 'string')
    .join('\n');

  if (!hostedCondition.includes("github.event.workflow_run.event == 'push'")) {
    errors.push('Hosted release chỉ được tự động deploy từ CI trigger push.');
  }
  if (
    !hostedCondition.includes("github.event.workflow_run.head_branch == 'main'")
  ) {
    errors.push('Hosted release chỉ được tự động deploy CI của main.');
  }
  if (
    !hostedCondition.includes(
      "github.event.workflow_run.conclusion == 'success'",
    )
  ) {
    errors.push('Hosted release phải yêu cầu CI workflow thành công.');
  }
  if (!hostedCommands.includes('pnpm install --frozen-lockfile')) {
    errors.push('Hosted release phải cài dependency từ lockfile frozen.');
  }
  if (hostedCommands.includes('--no-frozen-lockfile')) {
    errors.push('Hosted release không được bỏ qua frozen lockfile.');
  }
  if (hostedDeploy?.env?.NX_TUI !== 'false') {
    errors.push('Hosted release phải ép NX_TUI=false.');
  }
  if (nxCommandsMissingStaticOutput(hostedCommands).length) {
    errors.push(
      'Mọi lệnh Nx trong hosted release phải dùng --outputStyle=static.',
    );
  }
  if (
    !hostedCommands.includes(
      'actions/workflows/ci.yml/runs?head_sha=${RELEASE_SHA}&status=completed&per_page=100',
    ) ||
    !hostedCommands.includes('.head_sha == env.RELEASE_SHA') ||
    !hostedCommands.includes('.head_branch == "main"') ||
    !hostedCommands.includes('.event == "push"')
  ) {
    errors.push(
      'Hosted release dispatch phải kiểm tra đúng CI workflow push của exact SHA trên main.',
    );
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
