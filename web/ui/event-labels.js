import { messages } from '../i18n/messages.js';
import { t } from '../i18n/index.js';
import { declarationSummary } from './declarations.js';
import { coverageFor } from '../core/activities.js';
import { compilerStage } from '../core/compiler-stages.js';
export const shortVisitor = (name) =>
  (name || '').replace(/^Crystal::/, '').replace(/^Observatory::/, '');
export const eventLabel = (kind) =>
  kind === 'declaration'
    ? t('decl.operation')
    : messages[`event.${kind}`]
      ? t(`event.${kind}`)
      : kind || '—';
export function explanation(event, model) {
  if (!event) return '';
  if (event.kind === 'link')
    return t(
      event.link.exitCode === 0 && event.link.outputBytes !== null ? 'link.success' : 'link.failed',
    );
  if (event.kind === 'declaration' && model) return declarationSummary(event, model);
  if (event.kind === 'activity') return activitySummary(event);
  const visitor = shortVisitor(event.visitor);
  const values = {
    visitor,
    node: event.node_id,
    related: event.related_id,
    before: event.before || t('unknown'),
    after: event.after || t('unknown'),
    phase: event.phase,
  };
  if (event.kind === 'type' && visitor.includes('TopLevelVisitor') && event.after === 'Nil')
    return t('explain.declaration');
  if (['type', 'bind', 'unbind', 'expand', 'dispatch', 'rewrite', 'ir'].includes(event.kind))
    return t(`explain.${event.kind}`, values);
  if (['phase_enter', 'phase_leave'].includes(event.kind)) {
    const stage = compilerStage(event);
    return stage
      ? t(event.kind === 'phase_enter' ? 'pipeline.enter' : 'pipeline.leave', {
          stage: t(`pipeline.stage.${stage.id}`),
        })
      : event.detail || t('explain.phase', values);
  }
  if (event.kind === 'visit_enter') return t('explain.visit', values);
  if (event.kind.endsWith('_leave')) return t('explain.leave', values);
  if (event.kind === 'transform_enter') return t('explain.transform', values);
  if (event.kind === 'complete') return t('explain.complete');
  return event.detail || t('explain.phase', values);
}

export const sourceFiles = {
  MainVisitor: 'semantic/main_visitor.cr',
  TopLevelVisitor: 'semantic/top_level_visitor.cr',
  Normalizer: 'semantic/normalizer.cr',
  CleanupTransformer: 'semantic/cleanup_transformer.cr',
  FixMissingTypes: 'semantic/fix_missing_types.cr',
  TypeGuessVisitor: 'semantic/type_guess_visitor.cr',
  TypeDeclarationVisitor: 'semantic/type_declaration_visitor.cr',
  RestrictionsAugmenter: 'semantic/restrictions_augmenter.cr',
  InstanceVarsInitializerVisitor: 'semantic/instance_vars_initializer_visitor.cr',
  CodeGenVisitor: 'codegen/codegen.cr',
  'CodeGenVisitor::CodegenWellKnownFunctions': 'codegen/codegen.cr',
  ASTNode: 'semantic/bindings.cr',
  Call: 'semantic/call.cr',
  ExpandableNode: 'semantic/ast.cr',
  MacroInterpreter: 'macros/interpreter.cr',
  ToSVisitor: 'syntax/to_s.cr',
  HasSelfVisitor: 'semantic/type_guess_visitor.cr',
  ClassVarsInitializerVisitor: 'semantic/class_vars_initializer_visitor.cr',
};

export const visitorKey = (name) => shortVisitor(name).split('#')[0];
const visitorLetters = new Map([
  ['TypeGuessVisitor', 'G'],
  ['TypeDeclarationVisitor', 'D'],
  ['ToSVisitor', 'S'],
]);
export function visitorLetter(visitor) {
  const key = visitorKey(visitor);
  const name = key.split('::').at(-1) || '?';
  return visitorLetters.get(key) || Array.from(name)[0].toUpperCase();
}
export function activityLabel(activity) {
  return messages[`activity.${activity}`] ? t(`activity.${activity}`) : activity;
}
export function activitySummary(event) {
  return `${activityLabel(event.activity)}${event.after ? `: ${event.after}` : ''}`;
}
export function visitorRole(event, model) {
  if (!event) return '—';
  if (event.kind === 'link') return t('pipeline.action.link');
  const name = visitorKey(event.visitor);
  const role = t(
    !name ? 'visitor.stage' : messages[`visitor.${name}`] ? `visitor.${name}` : 'visitor.unknown',
  );
  const node = model?.nodes.get(event.node_id);
  const covered = node ? coverageFor(model.trace, event.visitor, node.kind) : [];
  return covered.length
    ? `${role}\n${node.kind} · ${t('activity.coverage', { activities: [...new Set(covered.flatMap((entry) => entry.activities))].map(activityLabel).join(', ') })}`
    : role;
}
