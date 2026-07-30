export const PLATFORM_TAGS = new Set(['platform:browser', 'platform:server']);

const SERVER_SCOPES = new Set(['scope:core', 'scope:e2e', 'scope:signaling']);

export function projectTagErrors({ projectPath, tags }) {
  const errors = [];
  if (!Array.isArray(tags)) {
    return [`${projectPath}: tags phải là một array.`];
  }

  const typeTags = tags.filter((tag) => tag.startsWith('type:'));
  const scopeTags = tags.filter((tag) => tag.startsWith('scope:'));
  const platformTags = tags.filter((tag) => tag.startsWith('platform:'));

  if (typeTags.length !== 1) {
    errors.push(`${projectPath}: cần đúng một tag type:*.`);
  }
  if (scopeTags.length !== 1) {
    errors.push(`${projectPath}: cần đúng một tag scope:*.`);
  }
  if (platformTags.length === 0) {
    errors.push(`${projectPath}: thiếu tag capability platform:*.`);
  }

  for (const platformTag of platformTags) {
    if (!PLATFORM_TAGS.has(platformTag)) {
      errors.push(`${projectPath}: platform tag không hợp lệ: ${platformTag}.`);
    }
  }

  const isAppPath = /^apps\/[^/]+\/project\.json$/u.test(projectPath);
  const isLibPath = /^libs\/[^/]+\/project\.json$/u.test(projectPath);
  if (!isAppPath && !isLibPath) {
    errors.push(
      `${projectPath}: project phải nằm trực tiếp trong apps/ hoặc libs/.`,
    );
  }
  if (isAppPath && !tags.includes('type:app')) {
    errors.push(`${projectPath}: project trong apps/ phải có type:app.`);
  }
  if (isLibPath && !tags.includes('type:lib')) {
    errors.push(`${projectPath}: project trong libs/ phải có type:lib.`);
  }

  if (tags.includes('scope:frontend') && !tags.includes('platform:browser')) {
    errors.push(`${projectPath}: frontend phải browser-compatible.`);
  }
  if (
    scopeTags.some((tag) => SERVER_SCOPES.has(tag)) &&
    !tags.includes('platform:server')
  ) {
    errors.push(`${projectPath}: backend/e2e phải server-compatible.`);
  }
  if (tags.includes('scope:shared') && !tags.includes('type:lib')) {
    errors.push(`${projectPath}: scope:shared chỉ dành cho library.`);
  }

  return errors;
}
