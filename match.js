// PURE matching + scope logic for which flows to pause. Node-tested.
import { hostInScope } from './scope.js';

// Resource types that are usually noise when tampering (static assets).
const STATIC_TYPES = new Set([
  'Stylesheet', 'Image', 'Font', 'Media', 'Manifest', 'Ping', 'CSPViolationReport',
]);
const STATIC_EXT = /\.(css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|map)(\?|#|$)/i;

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

export function inScope(url, hosts) {
  return hostInScope(hostOf(url), hosts || []);
}

export function isStatic(flow) {
  if (flow && flow.resourceType && STATIC_TYPES.has(flow.resourceType)) return true;
  return STATIC_EXT.test((flow && flow.url) || '');
}

// A rule with no conditions matches NOTHING (avoids an accidental match-all).
export function ruleMatches(flow, rule) {
  if (!rule || rule.enabled === false) return false;
  const hasCond = rule.method || rule.resourceType || rule.urlIncludes;
  if (!hasCond) return false;
  if (rule.method && (flow.method || '').toUpperCase() !== rule.method.toUpperCase()) return false;
  if (rule.resourceType && flow.resourceType !== rule.resourceType) return false;
  if (rule.urlIncludes && !((flow.url || '').includes(rule.urlIncludes))) return false;
  return true;
}

// Decide whether to pause a flow for manual editing.
// - intercept off           -> never pause (pass-through logging only)
// - skipStatic + static flow -> never pause
// - active rules present     -> pause only flows matching some rule
// - no rules                 -> pause every (non-static) flow
export function shouldPause(flow, opts = {}) {
  const { intercept = false, rules = [], skipStatic = true } = opts;
  if (!intercept) return false;
  if (skipStatic && isStatic(flow)) return false;
  const active = (rules || []).filter((r) => r && r.enabled !== false);
  if (active.length) return active.some((r) => ruleMatches(flow, r));
  return true;
}
