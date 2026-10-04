import { auditEvents, containers, equipment, registerTaskLifecycleHooks, tasks, type AuditEvent, type TaskOrigin, type YardTask } from './domain.js';

/**
 * 作业任务依赖与去重管理
 *
 * 关系模型：
 *  - prerequisite 前置：target 必须等 up 完成后才可执行
 *  - mutex       互斥：同一物理作业冲突（通常同箱），任一任务开始/完成后其余任务被压下
 *  - replacement 替代：replacement 取代 original；替代失败/取消时 original 自动恢复可执行
 *
 * 合并模型：
 *  - 只有「同箱号 + 同航次」且均未开始的任务才允许合并
 *  - 被合并任务进入 merged 状态并指向存活任务，来源（origins）全部并入存活任务
 *
 * 并发模型：
 *  - planVersion 在每次计划变更后单调递增；写操作携带 expectedVersion 做乐观并发控制
 */

export type RelationKind = 'prerequisite' | 'mutex' | 'replacement';

export interface TaskRelation {
  id: string;
  kind: RelationKind;
  /** prerequisite / replacement 中表示「前置任务 / 替代任务」；mutex 中为冲突的一方 */
  upTaskId: string;
  /** prerequisite / replacement 中表示「后置任务 / 被替代任务」；mutex 中为冲突的另一方 */
  downTaskId: string;
  declaredBy: string;
  declaredAt: string;
  active: boolean;
  revokedAt?: string;
  note?: string;
}

export interface MergeRecord {
  id: string;
  groupId: string;
  survivorId: string;
  mergedTaskIds: string[];
  mergedBy: string;
  mergedAt: string;
  undone: boolean;
  undoneAt?: string;
  /** 撤销合并时用于还原 */
  snapshot: {
    taskId: string;
    status: YardTask['status'];
    equipmentId?: string;
    priority: number;
    scheduledAt: string;
    originsCount: number;
    mergeGroupId?: string;
    mergedIntoId?: string;
  }[];
  note?: string;
}

export type EffectiveStatus =
  | 'ready'           // 当前可执行
  | 'waiting'         // 等待前置 / 等待替代结果
  | 'blocked'         // 被业务条件阻塞（设备、海关等）
  | 'suppressed'      // 被互斥胜出方 / 已生效替代压下
  | 'executing'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'merged'
  | 'cycle';          // 处在依赖环中

export interface TaskExecutionView {
  task: YardTask;
  containerVoyageId?: string;
  effectiveStatus: EffectiveStatus;
  executable: boolean;
  /** 可执行集合结论的逐条推导 */
  reasons: string[];
  prerequisites: { id: string; status: YardTask['status']; satisfied: boolean }[];
  replacements: { replacementId: string; status: YardTask['status']; effective: boolean }[];
  mutexes: { otherId: string; otherStatus: YardTask['status']; winnerId?: string }[];
  mergedOrigins: TaskOrigin[];
  mergedAwayTasks: string[];
  warnings: string[];
}

export interface PlanSnapshot {
  version: number;
  computedAt: string;
  executable: TaskExecutionView[];
  suppressed: TaskExecutionView[];
  waiting: TaskExecutionView[];
  cycles: { taskIds: string[]; message: string }[];
  relations: TaskRelation[];
  mergeGroups: { groupId: string; survivorId: string; mergedTaskIds: string[]; mergedAt: string }[];
  stats: { total: number; executable: number; suppressed: number; waiting: number; blocked: number; merged: number };
  derivation: string[];
}

export class PlannerConflict extends Error {
  code: string; currentVersion: number;
  constructor(message: string, code = 'PLANNER_CONFLICT', currentVersion = planVersion) {
    super(message); this.name = 'PlannerConflict'; this.code = code; this.currentVersion = currentVersion;
  }
}

export const relations: TaskRelation[] = [];
export const mergeRecords: MergeRecord[] = [];
export let planVersion = 1;

let relationSeq = 0;
let mergeSeq = 0;
let auditSeq = 900;
const nowIso = () => new Date().toISOString();
const bump = () => { planVersion += 1; };
function audit(actor: string, action: string, entityId: string, details: string) {
  auditEvents.unshift({ id: `AUD-P${++auditSeq}`, actor, action, entity: 'task-plan', entityId, at: nowIso(), details });
}
const findTask = (id: string) => tasks.find(item => item.id === id);
export function voyageOf(task: YardTask) {
  return containers.find(container => container.id === task.containerId)?.voyageId;
}
const ACTIVE = (relation: TaskRelation) => relation.active;
const STARTED: ReadonlySet<YardTask['status']> = new Set(['assigned', 'executing', 'done']);
const LOCKED: ReadonlySet<YardTask['status']> = new Set(['executing', 'done']);

// ───────────────────────────── 关系声明 ─────────────────────────────

const kindLabel: Record<RelationKind, string> = { prerequisite: '前置', mutex: '互斥', replacement: '替代' };

export function declareRelation(input: {
  kind: RelationKind; upTaskId: string; downTaskId: string;
  actor?: string; note?: string; expectedVersion?: number;
}): TaskRelation {
  const { kind, upTaskId, downTaskId } = input;
  assertVersion(input.expectedVersion);
  if (upTaskId === downTaskId) throw new PlannerConflict('不能对同一任务声明自相关关系', 'SELF_RELATION');
  const up = findTask(upTaskId), down = findTask(downTaskId);
  if (!up || !down) throw new PlannerConflict('任务不存在', 'TASK_NOT_FOUND');

  if (kind === 'replacement') {
    // 替代关系是「同一份作业」的方案替换，禁止跨箱号 / 跨航次
    if (up.containerId !== down.containerId) {
      throw new PlannerConflict(`箱号不同（${up.containerId} / ${down.containerId}），不能声明替代关系`, 'IDENTITY_MISMATCH');
    }
    if (voyageOf(up) !== voyageOf(down)) {
      throw new PlannerConflict(`航次不同（${voyageOf(up)} / ${voyageOf(down)}），不能声明替代关系`, 'IDENTITY_MISMATCH');
    }
  }
  for (const task of [up, down]) {
    if (task.status === 'merged') throw new PlannerConflict(`任务 ${task.id} 已被合并，不能再声明关系`, 'TASK_MERGED');
    if (LOCKED.has(task.status)) throw new PlannerConflict(`任务 ${task.id} 已开始执行（${task.status}），关系不可再变更`, 'TASK_LOCKED');
  }
  if (relations.some(r => r.active && r.kind === kind && r.upTaskId === upTaskId && r.downTaskId === downTaskId)) {
    throw new PlannerConflict(`${kindLabel[kind]}关系已存在（${upTaskId} → ${downTaskId}）`, 'RELATION_EXISTS');
  }
  // 前置/替代构成有向等待图：声明前先做环检测。候选边方向 up → down（down 等待 up）
  if (kind === 'prerequisite' || kind === 'replacement') {
    const candidate = { upTaskId, downTaskId, kind } as TaskRelation;
    const cycle = detectCycle([...relations.filter(ACTIVE), candidate]
      .filter(r => r.kind === 'prerequisite' || r.kind === 'replacement'));
    if (cycle) throw new PlannerConflict(`声明后会形成依赖环：${cycle.join(' → ')}，请先调整前置/替代链`, 'DEPENDENCY_CYCLE');
  }
  const relation: TaskRelation = {
    id: `REL-${++relationSeq}`, kind, upTaskId, downTaskId,
    declaredBy: input.actor ?? '中控调度员', declaredAt: nowIso(), active: true, note: input.note,
  };
  relations.push(relation);
  audit(relation.declaredBy, 'RELATION_DECLARE', relation.id,
    `声明${kindLabel[kind]}关系：${upTaskId} → ${downTaskId}${input.note ? `（${input.note}）` : ''}`);
  bump();
  return relation;
}

export function revokeRelation(relationId: string, actor = '中控调度员', expectedVersion?: number): TaskRelation {
  assertVersion(expectedVersion);
  const relation = relations.find(item => item.id === relationId);
  if (!relation) throw new PlannerConflict('关系记录不存在', 'RELATION_NOT_FOUND');
  if (!relation.active) throw new PlannerConflict('该关系已撤销', 'RELATION_INACTIVE');
  relation.active = false;
  relation.revokedAt = nowIso();
  audit(actor, 'RELATION_REVOKE', relation.id, `撤销${kindLabel[relation.kind]}关系：${relation.upTaskId} → ${relation.downTaskId}`);
  bump();
  return relation;
}

// ───────────────────────────── 合并去重 ─────────────────────────────

export function mergeTasks(input: {
  survivorId: string; taskIds: string[]; actor?: string; note?: string; expectedVersion?: number;
}): { record: MergeRecord; survivor: YardTask } {
  assertVersion(input.expectedVersion);
  const survivor = findTask(input.survivorId);
  if (!survivor) throw new PlannerConflict('存活任务不存在', 'TASK_NOT_FOUND');
  const targets = input.taskIds.filter(id => id !== input.survivorId);
  if (!targets.length) throw new PlannerConflict('请至少选择一个被合并任务', 'EMPTY_MERGE');
  const mergedTasks = targets.map(id => {
    const task = findTask(id);
    if (!task) throw new PlannerConflict(`被合并任务 ${id} 不存在`, 'TASK_NOT_FOUND');
    return task;
  });

  const survivorVoyage = voyageOf(survivor);
  for (const other of mergedTasks) {
    if (other.containerId !== survivor.containerId) {
      throw new PlannerConflict(`箱号不同：${survivor.id}(${survivor.containerId}) 与 ${other.id}(${other.containerId})，禁止合并`, 'IDENTITY_MISMATCH');
    }
    if (voyageOf(other) !== survivorVoyage) {
      throw new PlannerConflict(`航次不同：${survivor.id}(${survivorVoyage}) 与 ${other.id}(${voyageOf(other)})，禁止合并`, 'IDENTITY_MISMATCH');
    }
    if (STARTED.has(other.status) || STARTED.has(survivor.status)) {
      const lockedTask = STARTED.has(other.status) ? other : survivor;
      throw new PlannerConflict(`任务 ${lockedTask.id} 已开始执行（${lockedTask.status}），不可撤销或合并`, 'TASK_LOCKED');
    }
    if (other.status === 'merged') throw new PlannerConflict(`任务 ${other.id} 已在其它合并组中，不能重复合并`, 'ALREADY_MERGED');
  }
  if (survivor.status === 'merged') throw new PlannerConflict('存活任务自身已被合并', 'ALREADY_MERGED');

  const groupId = `GRP-${++mergeSeq}`;
  const snapshot: MergeRecord['snapshot'] = [
    snapshotTask(survivor),
    ...mergedTasks.map(snapshotTask),
  ];

  // 1) 来源并集：保留每条被合并任务的出处，追加一条去重来源
  const allOrigins = [...(survivor.origins ?? [])];
  for (const other of mergedTasks) {
    for (const origin of other.origins ?? []) allOrigins.push(origin);
    audit(input.actor ?? '中控调度员', 'TASK_MERGE_SOURCE', survivor.id,
      `并入 ${other.id} 的来源：${(other.origins ?? []).map(o => `${o.source}${o.reference ? `/${o.reference}` : ''}`).join('、') || '无登记来源'}`);
  }
  survivor.origins = dedupeOrigins(allOrigins);
  survivor.origins.push({ source: 'dedup', reference: groupId, createdAt: nowIso(), note: `合并 ${mergedTasks.map(t => t.id).join('、')} 时生成` });

  // 2) 计划字段取并集：最高优先级、最早计划时间；设备优先沿用存活任务，其次取已指派设备
  survivor.priority = Math.max(survivor.priority, ...mergedTasks.map(t => t.priority));
  survivor.scheduledAt = [survivor.scheduledAt, ...mergedTasks.map(t => t.scheduledAt)].sort()[0];
  if (!survivor.equipmentId) {
    const withEquipment = mergedTasks.find(t => t.equipmentId);
    if (withEquipment?.equipmentId) survivor.equipmentId = withEquipment.equipmentId;
  }
  if (survivor.status === 'queued' && survivor.equipmentId) survivor.status = 'assigned';
  survivor.revision = (survivor.revision ?? 1) + 1;
  survivor.mergeGroupId = groupId;

  // 3) 被合并任务落账
  for (const other of mergedTasks) {
    other.status = 'merged';
    other.mergedIntoId = survivor.id;
    other.mergeGroupId = groupId;
    other.revision = (other.revision ?? 1) + 1;
  }

  // 4) 关系重定向：任何指向被合并任务的活动关系改挂存活任务，去掉自环与重复边
  for (const relation of relations.filter(ACTIVE)) {
    if (relation.upTaskId === survivor.id && relation.downTaskId === survivor.id) { relation.active = false; relation.revokedAt = nowIso(); continue; }
    if (mergedTasks.some(t => t.id === relation.upTaskId)) relation.upTaskId = survivor.id;
    if (mergedTasks.some(t => t.id === relation.downTaskId)) relation.downTaskId = survivor.id;
    if (relation.upTaskId === relation.downTaskId) { relation.active = false; relation.revokedAt = nowIso(); }
  }
  dedupeActiveRelations();

  const record: MergeRecord = {
    id: `MRG-${mergeSeq}`, groupId, survivorId: survivor.id,
    mergedTaskIds: mergedTasks.map(t => t.id), mergedBy: input.actor ?? '中控调度员',
    mergedAt: nowIso(), undone: false, snapshot, note: input.note,
  };
  mergeRecords.push(record);
  audit(record.mergedBy, 'TASK_MERGE', survivor.id,
    `合并去重组 ${groupId}：存活 ${survivor.id}，合并 ${record.mergedTaskIds.join('、')}；箱号 ${survivor.containerId} / 航次 ${survivorVoyage}；来源已保留在任务详情`);
  bump();
  return { record, survivor };
}

export function unmergeTasks(groupId: string, actor = '中控调度员', expectedVersion?: number): MergeRecord {
  assertVersion(expectedVersion);
  const record = mergeRecords.find(item => item.groupId === groupId && !item.undone);
  if (!record) throw new PlannerConflict('合并组不存在或已撤销', 'MERGE_NOT_FOUND');
  const survivor = findTask(record.survivorId);
  if (survivor && STARTED.has(survivor.status)) {
    throw new PlannerConflict(`存活任务 ${survivor.id} 已开始执行（${survivor.status}），合并不可撤销`, 'TASK_LOCKED');
  }
  for (const snapshot of record.snapshot) {
    const task = findTask(snapshot.taskId);
    if (!task) continue;
    task.status = snapshot.status;
    task.equipmentId = snapshot.equipmentId;
    task.priority = snapshot.priority;
    task.scheduledAt = snapshot.scheduledAt;
    task.mergeGroupId = snapshot.mergeGroupId;
    task.mergedIntoId = snapshot.mergedIntoId;
    task.origins = (task.origins ?? []).filter(origin => origin.source !== 'dedup' || origin.reference !== groupId);
    task.revision = (task.revision ?? 1) + 1;
  }
  record.undone = true;
  record.undoneAt = nowIso();
  audit(actor, 'TASK_UNMERGE', record.survivorId, `撤销合并组 ${groupId}，恢复 ${record.mergedTaskIds.join('、')} 为独立任务`);
  bump();
  return record;
}

// ───────────────────────────── 任务生命周期 ─────────────────────────────

export function transitionTask(id: string, nextStatus: YardTask['status'], actor = '中控调度员', expectedVersion?: number): YardTask {
  assertVersion(expectedVersion);
  const task = findTask(id);
  if (!task) throw new PlannerConflict('任务不存在', 'TASK_NOT_FOUND');
  if (task.status === 'merged') throw new PlannerConflict(`任务 ${id} 已被合并进 ${task.mergedIntoId}，请操作存活任务`, 'TASK_MERGED');
  if (STARTED.has(task.status) && nextStatus !== 'done' && !(task.status === 'executing' && nextStatus === 'failed')) {
    throw new PlannerConflict(`任务 ${id} 已开始执行（${task.status}），不可撤销；只能推进到执行/完成/报失败`, 'TASK_LOCKED');
  }
  const allowed: Record<YardTask['status'], ReadonlySet<YardTask['status']>> = {
    queued: new Set(['assigned', 'blocked', 'cancelled', 'executing']),
    assigned: new Set(['executing', 'blocked', 'queued']),
    executing: new Set(['done', 'failed']),
    blocked: new Set(['queued', 'assigned', 'cancelled']),
    done: new Set(),
    cancelled: new Set(['queued']),
    failed: new Set(['queued']),
    merged: new Set(),
  };
  if (!allowed[task.status].has(nextStatus)) {
    throw new PlannerConflict(`任务状态不能从 ${task.status} 转为 ${nextStatus}`, 'ILLEGAL_TRANSITION');
  }
  const previous = task.status;
  task.status = nextStatus;
  task.revision = (task.revision ?? 1) + 1;

  // 替代任务失败/取消 → 被替代任务自动恢复
  if ((nextStatus === 'failed' || nextStatus === 'cancelled') && previous !== 'done') {
    const replacementRels = relations.filter(r => ACTIVE(r) && r.kind === 'replacement' && r.upTaskId === id);
    for (const rel of replacementRels) {
      const original = findTask(rel.downTaskId);
      if (original && original.status === 'queued') {
        original.blockingReasons = original.blockingReasons.filter(reason => !reason.includes('已被替代'));
        original.revision = (original.revision ?? 1) + 1;
        audit(actor, 'REPLACEMENT_FALLBACK', original.id,
          `替代任务 ${id} 状态为 ${nextStatus}，原任务 ${original.id} 自动恢复可执行`);
      }
    }
  }
  audit(actor, 'TASK_TRANSITION', id, `任务状态 ${previous} → ${nextStatus}`);
  bump();
  return task;
}

export function reassignTask(id: string, equipmentId: string, actor = '中控调度员', expectedVersion?: number): YardTask {
  assertVersion(expectedVersion);
  const task = findTask(id);
  if (!task) throw new PlannerConflict('任务不存在', 'TASK_NOT_FOUND');
  if (task.status === 'merged') throw new PlannerConflict(`任务 ${id} 已被合并，请重新指派存活任务 ${task.mergedIntoId}`, 'TASK_MERGED');
  if (LOCKED.has(task.status) && task.status !== 'executing') throw new PlannerConflict(`任务 ${id} 已完成，不能再改派设备`, 'TASK_LOCKED');
  const machine = equipment.find(item => item.id === equipmentId);
  if (!machine) throw new PlannerConflict('设备不存在', 'EQUIPMENT_NOT_FOUND');

  const previous = task.equipmentId;
  task.equipmentId = equipmentId;
  task.blockingReasons = task.blockingReasons.filter(reason =>
    !reason.includes('当前不可用') && !reason.includes('占用，需重新协调'));
  if (machine.status === 'maintenance' || machine.status === 'offline') {
    task.blockingReasons.push(`${machine.name} 当前不可用`);
  }
  // 设备同一时段被多个进行中任务占用 → 记录冲突并保留原因（不阻止调度员强制指派）
  const doubleBooked = tasks.filter(other => other.id !== id && other.equipmentId === equipmentId
    && (other.status === 'assigned' || other.status === 'executing')).map(other => other.id);
  if (doubleBooked.length) task.blockingReasons.push(`${machine.name} 同时被 ${doubleBooked.join('、')} 占用，需重新协调`);
  if (task.status === 'queued' && !task.blockingReasons.length) task.status = 'assigned';
  if (task.status === 'assigned' && task.blockingReasons.some(r => r.includes('不可用'))) task.status = 'blocked';
  task.revision = (task.revision ?? 1) + 1;
  audit(actor, 'EQUIPMENT_REASSIGN', id, `设备重新指派：${previous ?? '未指派'} → ${equipmentId}${doubleBooked.length ? `；占用冲突：${doubleBooked.join('、')}` : ''}`);
  bump();
  return task;
}

/** 任务删除前的级联：解除/失效关系，保护含存活合并任务的合并组 */
export function beforeTaskDelete(id: string): void {
  const task = findTask(id);
  if (!task) return;
  const activeGroup = mergeRecords.find(group => !group.undone && group.survivorId === id);
  if (activeGroup) {
    throw new PlannerConflict(`任务 ${id} 是合并组 ${activeGroup.groupId} 的存活任务，请先撤销合并再删除`, 'SURVIVOR_PROTECTED');
  }
  for (const relation of relations.filter(r => ACTIVE(r) && (r.upTaskId === id || r.downTaskId === id))) {
    relation.active = false;
    relation.revokedAt = nowIso();
  }
  audit('系统', 'RELATION_CASCADE', id, `删除任务 ${id}，联动失效其全部前置/互斥/替代关系`);
  bump();
}

/** 修改任务箱号前校验：合并任务与含活动关系的任务不允许直接改箱号，避免破坏身份一致性 */
export function beforeTaskRebind(id: string, nextContainerId: string): void {
  const task = findTask(id);
  if (!task) throw new PlannerConflict('任务不存在', 'TASK_NOT_FOUND');
  if (task.status === 'merged') throw new PlannerConflict('任务已被合并，不能修改箱号', 'TASK_MERGED');
  if (task.containerId === nextContainerId) return;
  if (relations.some(r => ACTIVE(r) && (r.upTaskId === id || r.downTaskId === id))) {
    throw new PlannerConflict('任务存在前置/互斥/替代关系，请先撤销关系再改挂箱号', 'RELATION_PRESENT');
  }
}

// ───────────────────────────── 可执行集合推导 ─────────────────────────────

export function computeSnapshot(): PlanSnapshot {
  const derivation: string[] = [];
  const activeRels = relations.filter(ACTIVE);
  const waitEdges = activeRels.filter(r => r.kind === 'prerequisite' || r.kind === 'replacement');

  const cycles = detectCycles(waitEdges).map(cycle => ({ taskIds: cycle.slice(0, -1), message: `依赖环：${cycle.join(' → ')}` }));
  const cycleNodes = new Set(cycles.flatMap(cycle => cycle.taskIds));
  if (cycles.length) {
    cycles.forEach(cycle => derivation.push(`检测到依赖环 ${cycle.message.replace('依赖环：', '')}：环上任务全部置为不可执行，等待调度员解环`));
  }

  // 被替代任务：只要替代任务未失败/取消，就压下原任务
  const replacedBy = new Map<string, string>();
  for (const rel of activeRels.filter(r => r.kind === 'replacement')) {
    const replacement = findTask(rel.upTaskId);
    if (replacement && replacement.status !== 'failed' && replacement.status !== 'cancelled') {
      replacedBy.set(rel.downTaskId, replacement.id);
    }
  }

  // 互斥胜出：已开始/完成的一方获胜；同状态则取优先级高、计划时间早者（只产生告警，不压下未开始任务）
  const mutexWinner = new Map<string, string>();
  const mutexWarnings = new Map<string, string[]>();
  for (const rel of activeRels.filter(r => r.kind === 'mutex')) {
    const a = findTask(rel.upTaskId), b = findTask(rel.downTaskId);
    if (!a || !b) continue;
    if (STARTED.has(a.status) && !STARTED.has(b.status)) mutexWinner.set(b.id, a.id);
    else if (STARTED.has(b.status) && !STARTED.has(a.status)) mutexWinner.set(a.id, b.id);
    else if (!STARTED.has(a.status) && !STARTED.has(b.status)) {
      const tip = `与 ${b.id} 互斥但双方均未开始，需人工裁决，系统不自动取舍`;
      mutexWarnings.set(a.id, [...(mutexWarnings.get(a.id) ?? []), tip]);
      mutexWarnings.set(b.id, [...(mutexWarnings.get(b.id) ?? []), `与 ${a.id} 互斥但双方均未开始，需人工裁决，系统不自动取舍`]);
    }
  }

  const views = tasks.map(task => buildView(task, { cycleNodes, replacedBy, mutexWinner, mutexWarnings, activeRels, waitEdges }));
  const executable = views.filter(v => v.executable)
    .sort((a, b) => b.task.priority - a.task.priority || a.task.scheduledAt.localeCompare(b.task.scheduledAt));
  const suppressed = views.filter(v => !v.executable && ['suppressed', 'merged'].includes(v.effectiveStatus));
  const waiting = views.filter(v => !v.executable && !['suppressed', 'merged'].includes(v.effectiveStatus));

  executable.forEach((view, index) => derivation.push(
    `${index + 1}. ${view.task.id} 可执行：${view.reasons.join('；') || '无前置/互斥/替代约束'}`));
  [...suppressed, ...waiting].forEach(view => derivation.push(
    `× ${view.task.id} 当前不执行（${view.effectiveStatus}）：${view.reasons.join('；')}`));

  const groups = mergeRecords.filter(record => !record.undone).map(record => ({
    groupId: record.groupId, survivorId: record.survivorId, mergedTaskIds: record.mergedTaskIds, mergedAt: record.mergedAt,
  }));

  return {
    version: planVersion,
    computedAt: nowIso(),
    executable, suppressed, waiting, cycles,
    relations: activeRels,
    mergeGroups: groups,
    stats: {
      total: tasks.length,
      executable: executable.length,
      suppressed: suppressed.filter(v => v.effectiveStatus === 'suppressed').length,
      waiting: waiting.filter(v => v.effectiveStatus === 'waiting').length,
      blocked: views.filter(v => v.effectiveStatus === 'blocked').length,
      merged: views.filter(v => v.effectiveStatus === 'merged').length,
    },
    derivation,
  };
}

interface ViewContext {
  cycleNodes: Set<string>;
  replacedBy: Map<string, string>;
  mutexWinner: Map<string, string>;
  mutexWarnings: Map<string, string[]>;
  activeRels: TaskRelation[];
  waitEdges: TaskRelation[];
}

function buildView(task: YardTask, ctx: ViewContext): TaskExecutionView {
  const reasons: string[] = [];
  const warnings = [...(ctx.mutexWarnings.get(task.id) ?? [])];
  const prerequisites = ctx.activeRels.filter(r => r.kind === 'prerequisite' && r.downTaskId === task.id).map(rel => {
    const prereq = findTask(rel.upTaskId);
    return { id: rel.upTaskId, status: prereq?.status ?? 'cancelled', satisfied: prereq?.status === 'done' };
  });
  const replacements = ctx.activeRels.filter(r => r.kind === 'replacement' && r.downTaskId === task.id).map(rel => {
    const replacement = findTask(rel.upTaskId);
    const status = replacement?.status ?? 'failed';
    return { replacementId: rel.upTaskId, status, effective: status !== 'failed' && status !== 'cancelled' };
  });
  const mutexes = ctx.activeRels.filter(r => r.kind === 'mutex' && (r.upTaskId === task.id || r.downTaskId === task.id)).map(rel => {
    const otherId = rel.upTaskId === task.id ? rel.downTaskId : rel.upTaskId;
    return { otherId, otherStatus: findTask(otherId)?.status ?? 'cancelled', winnerId: ctx.mutexWinner.get(task.id) };
  });

  const group = mergeRecords.find(record => !record.undone && record.groupId === task.mergeGroupId);
  const mergedAwayTasks = task.mergeGroupId && group?.survivorId === task.id
    ? group.mergedTaskIds
    : [];
  const mergedOrigins = task.origins ?? [];

  let effectiveStatus: EffectiveStatus;
  if (task.status === 'merged') {
    effectiveStatus = 'merged';
    reasons.push(`已并入 ${task.mergedIntoId}，本计划不重复执行，来源已并入存活任务`);
  } else if (ctx.cycleNodes.has(task.id)) {
    effectiveStatus = 'cycle';
    reasons.push('位于前置/替代依赖环中，环不解开不可执行');
  } else if (task.status === 'executing') {
    effectiveStatus = 'executing';
    reasons.push('作业进行中');
  } else if (task.status === 'done') {
    effectiveStatus = 'done';
    reasons.push('已完成');
  } else if (task.status === 'failed') {
    effectiveStatus = 'failed';
    reasons.push('作业失败，等待重排或改派');
  } else if (task.status === 'cancelled') {
    effectiveStatus = 'cancelled';
    reasons.push('任务已取消');
  } else if (ctx.mutexWinner.has(task.id)) {
    effectiveStatus = 'suppressed';
    reasons.push(`互斥任务 ${ctx.mutexWinner.get(task.id)} 已开始/完成，本任务被压下`);
  } else if (ctx.replacedBy.has(task.id)) {
    const replacementId = ctx.replacedBy.get(task.id)!;
    const replacement = findTask(replacementId);
    effectiveStatus = 'suppressed';
    reasons.push(`已被替代任务 ${replacementId}（${replacement?.status}）取代，不重复执行`);
  } else if (replacements.some(r => !r.effective)) {
    const failed = replacements.filter(r => !r.effective);
    effectiveStatus = task.blockingReasons.length ? 'blocked' : (task.status === 'queued' || task.status === 'assigned') ? 'ready' : 'waiting';
    reasons.push(`替代任务 ${failed.map(r => `${r.replacementId}(${r.status})`).join('、')} 已失败/取消，原任务恢复执行`);
  } else {
    const pending = prerequisites.filter(p => !p.satisfied);
    const cancelled = pending.filter(p => p.status === 'cancelled' || p.status === 'failed');
    if (cancelled.length) {
      effectiveStatus = 'blocked';
      reasons.push(`前置任务 ${cancelled.map(p => `${p.id}(${p.status})`).join('、')} 已取消/失败，链路断裂，需人工重排`);
    } else if (pending.length) {
      effectiveStatus = 'waiting';
      reasons.push(`等待前置 ${pending.map(p => `${p.id}(${p.status})`).join('、')} 完成`);
    } else if (task.blockingReasons.length) {
      effectiveStatus = 'blocked';
      reasons.push(...task.blockingReasons);
    } else {
      effectiveStatus = 'ready';
      reasons.push(task.equipmentId ? `设备 ${task.equipmentId} 已就绪` : '无设备指派，可由任意可用设备接单');
      if (mergedAwayTasks.length) reasons.push(`已合并去重 ${mergedAwayTasks.join('、')}，仅执行本任务一次`);
    }
  }

  const executable = effectiveStatus === 'ready';
  return { task, containerVoyageId: voyageOf(task), effectiveStatus, executable, reasons, prerequisites, replacements, mutexes, mergedOrigins, mergedAwayTasks, warnings };
}

export function taskDetailView(id: string) {
  const task = findTask(id);
  if (!task) return undefined;
  const snapshot = computeSnapshot();
  const view = [...snapshot.executable, ...snapshot.suppressed, ...snapshot.waiting].find(item => item.task.id === id);
  const group = mergeRecords.find(record => record.groupId === task.mergeGroupId);
  return {
    view,
    relations: relations.filter(r => r.upTaskId === id || r.downTaskId === id),
    mergeRecord: group,
    lineage: buildLineage(id),
    planVersion: snapshot.version,
  };
}

function buildLineage(id: string): string[] {
  const lineage: string[] = [];
  const task = findTask(id);
  if (!task) return lineage;
  for (const origin of task.origins ?? []) {
    lineage.push(`来源 ${origin.source}${origin.reference ? `/${origin.reference}` : ''} · ${origin.createdAt}${origin.note ? ` · ${origin.note}` : ''}`);
  }
  for (const record of mergeRecords.filter(r => r.mergedTaskIds.includes(id) && !r.undone)) {
    lineage.push(`在 ${record.mergedAt} 被合并进 ${record.survivorId}（操作人 ${record.mergedBy}）`);
  }
  for (const record of mergeRecords.filter(r => r.survivorId === id && !r.undone)) {
    lineage.push(`合并组 ${record.groupId} 存活任务，吸收了 ${record.mergedTaskIds.join('、')} 的全部来源`);
  }
  return lineage;
}

export function listAudit(limit = 60): AuditEvent[] {
  return auditEvents.slice(0, limit);
}

// ───────────────────────────── 内部工具 ─────────────────────────────

function assertVersion(expected?: number) {
  if (expected !== undefined && expected !== planVersion) {
    throw new PlannerConflict(`计划版本已过期（你的版本 ${expected}，当前 ${planVersion}），请刷新后重试`, 'STALE_VERSION');
  }
}

function snapshotTask(task: YardTask): MergeRecord['snapshot'][number] {
  return {
    taskId: task.id, status: task.status, equipmentId: task.equipmentId,
    priority: task.priority, scheduledAt: task.scheduledAt,
    originsCount: (task.origins ?? []).length,
    mergeGroupId: task.mergeGroupId, mergedIntoId: task.mergedIntoId,
  };
}

function dedupeOrigins(origins: TaskOrigin[]): TaskOrigin[] {
  const seen = new Set<string>();
  return origins.filter(origin => {
    const key = `${origin.source}|${origin.reference ?? ''}|${origin.note ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function dedupeActiveRelations() {
  const seen = new Set<string>();
  for (const relation of relations) {
    if (!relation.active) continue;
    const key = `${relation.kind}|${relation.upTaskId}|${relation.downTaskId}`;
    if (seen.has(key)) { relation.active = false; relation.revokedAt = nowIso(); }
    else seen.add(key);
  }
}

/** 返回一条有向等待边（up → down 表示 down 等 up）上的环 */
function detectCycle(edges: TaskRelation[]): string[] | undefined {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    graph.set(edge.upTaskId, [...(graph.get(edge.upTaskId) ?? []), edge.downTaskId]);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let found: string[] | undefined;
  const dfs = (node: string) => {
    if (found) return;
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        found = [...stack.slice(stack.indexOf(next)), next];
        return;
      }
      if ((color.get(next) ?? WHITE) === WHITE) dfs(next);
      if (found) return;
    }
    stack.pop();
    color.set(node, BLACK);
  };
  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
    if (found) break;
  }
  return found;
}

function detectCycles(edges: TaskRelation[]): string[][] {
  const cycles: string[][] = [];
  let guard = 0;
  // 每找到一条环就移除环上的一条边继续找，避免同环重复报告
  while (guard++ < 32) {
    const cycle = detectCycle(edges);
    if (!cycle) break;
    cycles.push(cycle);
    edges = edges.filter(edge => !(edge.upTaskId === cycle[0] && edge.downTaskId === cycle[1]));
  }
  return cycles;
}

// ───────────────────────────── 种子关系（依赖模块加载顺序：domain 数据已就绪） ─────────────────────────────

function seedRelations() {
  const declare = (kind: RelationKind, upTaskId: string, downTaskId: string, note: string) => {
    const up = findTask(upTaskId), down = findTask(downTaskId);
    if (!up || !down) return;
    relations.push({
      id: `REL-${++relationSeq}`, kind, upTaskId, downTaskId,
      declaredBy: '系统种子', declaredAt: nowIso(), active: true, note,
    });
  };
  // TASK-102 移位完成后才能做 TASK-103 查验
  declare('prerequisite', 'TASK-102', 'TASK-103', '冷藏箱移位到查验区后才能开查验');
  // TASK-207 是 TASK-206 的替代（207 已失败 → 206 应自动恢复）
  declare('replacement', 'TASK-207', 'TASK-206', '集卡直提替代原场桥提箱方案');
  if (findTask('TASK-207')?.status === 'failed') {
    audit('系统', 'REPLACEMENT_FALLBACK', 'TASK-206', '替代任务 TASK-207 状态为 failed，原任务 TASK-206 自动恢复可执行（种子数据）');
  }
  // TASK-209 装船依赖 TASK-208 收箱（208 已取消 → 链路断裂需重排）
  declare('prerequisite', 'TASK-208', 'TASK-209', '先进场再装船');
  // 两个查验后移位方案互斥
  declare('mutex', 'TASK-210', 'TASK-211', '同一危险品箱不能同时去中转区和留查验区');
}
seedRelations();

// 自注册任务生命周期保护：无论通过 API（index.ts）还是直接调用领域层，
// 删除/改挂箱号都会经过合并组存活保护与关系级联失效
registerTaskLifecycleHooks({ beforeDelete: beforeTaskDelete, beforeRebind: beforeTaskRebind });
