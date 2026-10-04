import test from 'node:test'; import assert from 'node:assert/strict';
import { createContainer, createYardTask, deleteYardTask, tasks } from './domain.js';
import { computeSnapshot, declareRelation, listAudit, mergeTasks, PlannerConflict, reassignTask, revokeRelation, taskDetailView, transitionTask, unmergeTasks, type PlanSnapshot } from './planner.js';

const find = (id: string) => tasks.find(task => task.id === id)!;
const viewOf = (snapshot: PlanSnapshot, id: string) =>
  [...snapshot.executable, ...snapshot.suppressed, ...snapshot.waiting].find(view => view.task.id === id)!;
const relationExists = (kind: string, up: string, down: string) =>
  computeSnapshot().relations.some(relation => relation.kind === kind && relation.upTaskId === up && relation.downTaskId === down);

test('种子数据：替代失败自动恢复、前置取消阻塞、未裁决互斥给出告警', () => {
  const snapshot = computeSnapshot();
  // TASK-207 替代 TASK-206，且 207 已失败 → 206 自动恢复
  assert.equal(viewOf(snapshot, 'TASK-206').effectiveStatus, 'ready');
  assert.ok(viewOf(snapshot, 'TASK-206').reasons.some(reason => reason.includes('恢复执行')));
  // TASK-208 已取消 → TASK-209 链路断裂
  assert.equal(viewOf(snapshot, 'TASK-209').effectiveStatus, 'blocked');
  assert.ok(viewOf(snapshot, 'TASK-209').reasons.some(reason => reason.includes('已取消')));
  // TASK-210 / 211 互斥且都没开始 → 双方仍可执行但产生人工裁决告警
  assert.ok(viewOf(snapshot, 'TASK-210').warnings.some(warning => warning.includes('互斥')));
  assert.equal(viewOf(snapshot, 'TASK-210').executable, true);
});

test('合并同箱同航次的重复计划：只保留一个可执行任务且来源完整保留', () => {
  const before = computeSnapshot().version;
  const { survivor } = mergeTasks({ survivorId: 'TASK-204', taskIds: ['TASK-205'], note: '重复收箱去重', expectedVersion: before });
  assert.equal(survivor.id, 'TASK-204');
  assert.equal(find('TASK-205').status, 'merged');
  assert.equal(find('TASK-205').mergedIntoId, 'TASK-204');
  // 两条来源（gate + manual）+ 去重来源
  const sources = (survivor.origins ?? []).map(origin => origin.source);
  assert.ok(sources.includes('gate'));
  assert.ok(sources.includes('manual'));
  assert.ok(sources.includes('dedup'));

  const snapshot = computeSnapshot();
  const view = viewOf(snapshot, 'TASK-204');
  assert.equal(view.executable, true);
  assert.ok(view.reasons.some(reason => reason.includes('TASK-205')));
  assert.equal(viewOf(snapshot, 'TASK-205').effectiveStatus, 'merged');
  assert.ok(snapshot.version > before);

  const detail = taskDetailView('TASK-204')!;
  assert.ok(detail.lineage.some(line => line.includes('TASK-205')));
  assert.ok(detail.mergeRecord);
});

test('禁止跨箱号、跨航次的相似任务误合并', () => {
  // 不同箱号（MSCU vs OOLU）——即使都是收箱、路径相似
  assert.throws(() => mergeTasks({ survivorId: 'TASK-201', taskIds: ['TASK-204'] }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'IDENTITY_MISMATCH');
  // 同箱号但不同航次：临时把一个任务改挂到另一航次的新箱上再验证
  const otherVoyageContainer = createContainer({
    id: 'TEST-VOY-MISMATCH', voyageId: 'VOY-QF2', size: '40', isoType: '45G1', direction: 'import',
    status: 'in-transit', weightT: 20, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'B07-R12-T1',
  });
  const otherTask = createYardTask({ kind: 'deliver', containerId: otherVoyageContainer.id, from: 'B07-R12-T1', to: '南闸口', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 15 });
  assert.throws(() => mergeTasks({ survivorId: 'TASK-201', taskIds: [otherTask.id] }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'IDENTITY_MISMATCH');
  // 同箱同航次、目的地不同（人工确认后）允许合并到同一计划
  const { survivor } = mergeTasks({ survivorId: 'TASK-201', taskIds: ['TASK-202'] });
  assert.equal(find('TASK-202').mergedIntoId, survivor.id);
});

test('已开始任务不可合并；存活任务开始后合并不可撤销', () => {
  // 新建两个同箱任务，把其中一个置为 assigned（已开始）→ 合并必须拒绝
  const queued = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 30, scheduledAt: new Date().toISOString(), estimatedMinutes: 15 });
  const started = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 31, scheduledAt: new Date().toISOString(), estimatedMinutes: 15 });
  transitionTask(started.id, 'assigned');
  assert.throws(() => mergeTasks({ survivorId: queued.id, taskIds: [started.id] }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'TASK_LOCKED');
  // 独立合并组：存活任务一旦接单（assigned），合并即不可撤销
  const live = createYardTask({ kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R08-T1', priority: 30, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  const dup = createYardTask({ kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R08-T1', priority: 31, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  const { record } = mergeTasks({ survivorId: live.id, taskIds: [dup.id] });
  transitionTask(live.id, 'assigned');
  assert.throws(() => unmergeTasks(record.groupId), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'TASK_LOCKED');
});

test('依赖环检测：声明会成环的前置/替代关系会被拒绝', () => {
  const tA = createYardTask({ kind: 'rehandle', containerId: 'MSCU-4829017', from: 'A01-R01-T1', to: 'A01-R02-T1', priority: 10, scheduledAt: new Date().toISOString(), estimatedMinutes: 10 });
  const tB = createYardTask({ kind: 'rehandle', containerId: 'MSCU-4829017', from: 'A01-R02-T1', to: 'A01-R03-T1', priority: 10, scheduledAt: new Date().toISOString(), estimatedMinutes: 10 });
  declareRelation({ kind: 'prerequisite', upTaskId: tA.id, downTaskId: tB.id });
  assert.throws(() => declareRelation({ kind: 'prerequisite', upTaskId: tB.id, downTaskId: tA.id }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'DEPENDENCY_CYCLE');
  // 替代边同样参与环检测
  assert.throws(() => declareRelation({ kind: 'replacement', upTaskId: tB.id, downTaskId: tA.id }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'DEPENDENCY_CYCLE');
});

test('前置任务取消：后置任务进入 blocked 且原因可解释', () => {
  const snapshot = computeSnapshot();
  const view = viewOf(snapshot, 'TASK-209');
  assert.equal(view.executable, false);
  assert.ok(view.prerequisites.some(pre => pre.id === 'TASK-208' && pre.status === 'cancelled'));
});

test('替代任务生命周期：生效时原任务压下，失败时自动恢复', () => {
  // 种子：207 failed → 206 ready
  assert.equal(viewOf(computeSnapshot(), 'TASK-206').executable, true);
  // 重新排队 207 后一路推进到完成（失败任务重排后不可再取消）→ 206 应被压下
  transitionTask('TASK-207', 'queued');
  transitionTask('TASK-207', 'executing');
  transitionTask('TASK-207', 'done');
  let snapshot = computeSnapshot();
  assert.equal(viewOf(snapshot, 'TASK-206').effectiveStatus, 'suppressed');
  assert.ok(viewOf(snapshot, 'TASK-206').reasons.some(reason => reason.includes('TASK-207')));
  // 已完成的替代不可改
  assert.throws(() => transitionTask('TASK-207', 'cancelled'), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'TASK_LOCKED');
});

test('两个调度员同时合并：乐观版本控制拒绝过期写入', () => {
  const version = computeSnapshot().version;
  // 调度员甲先撤销 210/211 互斥，抬高版本
  const mutexRel = computeSnapshot().relations.find(r => r.kind === 'mutex' && r.upTaskId === 'TASK-210')!;
  revokeRelation(mutexRel.id, '调度员甲', version);
  // 调度员乙拿着旧版本合并 102+203 → STALE_VERSION
  assert.throws(() => mergeTasks({ survivorId: 'TASK-102', taskIds: ['TASK-203'], expectedVersion: version }), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'STALE_VERSION');
  // 用新版本重试成功
  const fresh = computeSnapshot().version;
  const { survivor } = mergeTasks({ survivorId: 'TASK-102', taskIds: ['TASK-203'], expectedVersion: fresh });
  assert.equal(find('TASK-203').status, 'merged');
  assert.equal(survivor.id, 'TASK-102');
});

test('互斥裁决：一方开始后另一方被压下；执行中的任务不可取消', () => {
  declareRelation({ kind: 'mutex', upTaskId: 'TASK-210', downTaskId: 'TASK-211' });
  transitionTask('TASK-210', 'executing');
  const snapshot = computeSnapshot();
  assert.equal(viewOf(snapshot, 'TASK-211').effectiveStatus, 'suppressed');
  assert.ok(viewOf(snapshot, 'TASK-211').reasons.some(reason => reason.includes('TASK-210')));
  assert.throws(() => transitionTask('TASK-210', 'cancelled'), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'TASK_LOCKED');
  // assigned（已接单、尚未执行）同样不可直接取消
  const queuedTask = createYardTask({ kind: 'deliver', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: '南闸口', priority: 20, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  transitionTask(queuedTask.id, 'assigned');
  assert.throws(() => transitionTask(queuedTask.id, 'cancelled'), (error: unknown) =>
    error instanceof PlannerConflict && error.code === 'TASK_LOCKED');
});

test('设备重新指派：占用冲突给出阻塞原因，改派后清除', () => {
  // 先把 203 恢复出来（上个用例把它合并了），改用独立任务验证
  const task = createYardTask({ kind: 'rehandle', containerId: 'EISU-1288420', from: 'B07-R01-T1', to: 'D05-R01-T1', priority: 20, scheduledAt: new Date().toISOString(), estimatedMinutes: 20 });
  const assigned = reassignTask(task.id, 'YC-12'); // YC-12 正被 TASK-101 占用
  assert.equal(assigned.equipmentId, 'YC-12');
  assert.ok(assigned.blockingReasons.some(reason => reason.includes('TASK-101')));
  const moved = reassignTask(task.id, 'YC-05');
  assert.ok(!moved.blockingReasons.some(reason => reason.includes('TASK-101')));
});

test('可执行集合推导逐条可解释，统计与审计完整', () => {
  const snapshot = computeSnapshot();
  assert.ok(snapshot.derivation.length >= 4);
  assert.ok(snapshot.derivation.some(line => line.includes('可执行')));
  assert.ok(snapshot.derivation.some(line => line.includes('不执行')));
  assert.equal(snapshot.stats.total, tasks.length);
  const actions = listAudit(200).map(event => event.action);
  assert.ok(actions.includes('TASK_MERGE'));
  assert.ok(actions.includes('REPLACEMENT_FALLBACK'));
  assert.ok(actions.includes('EQUIPMENT_REASSIGN'));
  assert.ok(actions.includes('RELATION_DECLARE'));
});

test('撤销未开始的合并可恢复任务；关系在合并后仍保留在存活任务上', () => {
  const anchor = createYardTask({ kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R02-T1', priority: 28, scheduledAt: new Date(Date.now() + 3600e3).toISOString(), estimatedMinutes: 12 });
  const x = createYardTask({ kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R01-T1', priority: 30, scheduledAt: new Date(Date.now() + 3600e3).toISOString(), estimatedMinutes: 12 });
  const y = createYardTask({ kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R01-T1', priority: 32, scheduledAt: new Date(Date.now() + 3600e3).toISOString(), estimatedMinutes: 12 });
  declareRelation({ kind: 'mutex', upTaskId: anchor.id, downTaskId: x.id });
  const { record } = mergeTasks({ survivorId: x.id, taskIds: [y.id] });
  // 合并期间关系不丢；撤销后 y 复活
  unmergeTasks(record.groupId);
  assert.notEqual(find(y.id).status, 'merged');
  assert.equal(find(y.id).mergedIntoId, undefined);
  assert.ok(relationExists('mutex', anchor.id, x.id));

  // 存活任务受保护：直接删除合并组存活任务会被钩子拒绝
  const protectedMerge = mergeTasks({ survivorId: x.id, taskIds: [y.id] });
  assert.throws(() => deleteYardTask(x.id), (error: unknown) => error instanceof Error && /先撤销合并/.test(error.message));
  unmergeTasks(protectedMerge.record.groupId);
});
