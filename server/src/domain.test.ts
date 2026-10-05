import test from 'node:test'; import assert from 'node:assert/strict'; import { assignTask, containerPlan, dashboard, declareTaskRelation, gateConflicts, mergeDuplicateTasks, prioritizeTasks, taskDetail, taskGraphSnapshot, tasks, transitionTask } from './domain.js';
test('dashboard aggregates berth, yard, gate and exception signals', () => { const data = dashboard(); assert.equal(data.activeVoyages, 2); assert.ok(data.yardUtilization > 0.7); assert.ok(data.blockedTasks >= 1); });
test('gate conflict engine detects same truck overlap', () => { const conflicts = gateConflicts(); assert.ok(conflicts.some(item => item.appointmentId === 'APT-9001' || item.appointmentId === 'APT-9004')); });
test('yard planner respects reefer and hazmat constraints', () => { const plan = containerPlan('TGHU-9831204'); assert.equal(plan?.recommendedBlock?.hazmatAllowed, true); assert.ok(plan?.reasons.some(reason => reason.includes('危险品'))); });
test('priority queue promotes customs inspection work', () => { const tasks = prioritizeTasks(); assert.equal(tasks[0].containerId, 'TGHU-9831204'); });

test('container create, update and delete form a complete audited CRUD cycle', async () => {
  const { createContainer, updateContainer, deleteContainer, containers } = await import('./domain.js');
  const created = createContainer({ id: 'TEST-CRUD-0001', voyageId: 'VOY-AX7', size: '20', isoType: '22G1', direction: 'import', status: 'in-yard', weightT: 10, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R11-T1' });
  assert.equal(created.id, 'TEST-CRUD-0001');
  assert.equal(updateContainer(created.id, { weightT: 12 })?.weightT, 12);
  assert.equal(deleteContainer(created.id)?.id, 'TEST-CRUD-0001');
  assert.equal(containers.some(item => item.id === 'TEST-CRUD-0001'), false);
});

test('appointment and task domain operations support create, update and delete', async () => {
  const { createGateAppointment, editGateAppointment, deleteGateAppointment, createYardTask, updateYardTask, deleteYardTask } = await import('./domain.js');
  const appointment = createGateAppointment({ containerId: 'MSCU-4829017', truckNo: 'TEST-CRUD-01', driver: '测试司机', type: 'pickup', windowStart: new Date(Date.now()+3600000).toISOString(), windowEnd: new Date(Date.now()+7200000).toISOString(), lane: 'north' });
  assert.equal(editGateAppointment(appointment.id, { driver: '更新司机' })?.driver, '更新司机');
  assert.equal(deleteGateAppointment(appointment.id)?.id, appointment.id);
  const task = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R01-T1', to: '南闸口', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  assert.equal(updateYardTask(task.id, { to: '北闸口' })?.to, '北闸口');
  assert.equal(deleteYardTask(task.id)?.id, task.id);
});


const soon = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
async function graphModule() {
  return import('./domain.js');
}
function createStandaloneTask(containerId: string, suffix: string, overrides: Partial<Parameters<Awaited<ReturnType<typeof graphModule>>['createYardTask']>[0]> = {}) {
  const mod = require_graphModule();
  const task = mod.createYardTask({ kind: 'rehandle', containerId, from: `TEST-FROM-${suffix}`, to: `TEST-TO-${suffix}`, priority: 45, scheduledAt: soon(60), estimatedMinutes: 15, sourceLabel: `测试来源-${suffix}`, ...overrides }) as { id: string };
  return task.id;
}
let require_graphModule = () => moduleProxy;
const moduleProxy = { createYardTask: (...args: any[]) => (globalThis as any).__domainTestModule.createYardTask(...args) };

test('task graph merges exact duplicates, keeps sources and blocks cross container or voyage merge', async () => {
  const mod = await graphModule();
  (globalThis as any).__domainTestModule = mod;
  const a = createStandaloneTask('MSCU-4829017', 'DUP-A', { priority: 50, from: 'DUP-LOC', to: 'DUP-GATE' });
  const b = createStandaloneTask('MSCU-4829017', 'DUP-B', { priority: 40, from: 'DUP-LOC', to: 'DUP-GATE' });
  const otherVoyage = createStandaloneTask('CMAU-6001722', 'DUP-C', { priority: 60, from: 'DUP-LOC', to: 'DUP-GATE' });
  const version = mod.taskGraphSnapshot().version;
  assert.throws(() => mod.mergeDuplicateTasks({ survivorTaskId: a, duplicateTaskIds: [otherVoyage], expectedVersion: version }), /不属于同一箱号和航次/);
  const stale = mod.mergeDuplicateTasks({ survivorTaskId: a, duplicateTaskIds: [b], expectedVersion: version, reason: '重复提箱' });
  assert.deepEqual(stale.executableSet.includes(b), false);
  assert.ok(stale.executableSet.includes(a));
  assert.ok(mod.taskDetail(a)?.task.sources.some(source => source.originalTaskId === b));
  assert.throws(() => mod.mergeDuplicateTasks({ survivorTaskId: a, duplicateTaskIds: [], expectedVersion: version }), /版本已变化/);
  assert.ok(mod.taskGraphSnapshot().nearDuplicateGuards.some(item => item.taskIds.includes(otherVoyage)));
});

test('dependency cycles are rejected and cancelled prerequisites explain blocked successors', async () => {
  const mod = await graphModule();
  const a = createStandaloneTask('MSCU-4829017', 'CYC-A');
  const b = createStandaloneTask('MSCU-4829017', 'CYC-B');
  const c = createStandaloneTask('MSCU-4829017', 'CYC-C');
  let version = mod.taskGraphSnapshot().version;
  mod.declareTaskRelation({ type: 'predecessor', fromTaskId: a, toTaskId: b, expectedVersion: version, reason: '测试链' });
  version = mod.taskGraphSnapshot().version;
  mod.declareTaskRelation({ type: 'predecessor', fromTaskId: b, toTaskId: c, expectedVersion: version, reason: '测试链' });
  version = mod.taskGraphSnapshot().version;
  assert.throws(() => mod.declareTaskRelation({ type: 'predecessor', fromTaskId: c, toTaskId: a, expectedVersion: version, reason: '成环' }), /依赖环/);
  version = mod.taskGraphSnapshot().version;
  mod.transitionTask(a, { action: 'cancel', expectedVersion: version, reason: '前置取消测试' });
  const detail = mod.taskDetail(c);
  assert.ok(detail?.task.dependencyBlockers.some(reason => reason.includes(a) && reason.includes('已取消')));
  assert.equal(detail?.executable, false);
});

test('replacement failure restores alternative when policy says so', async () => {
  const mod = await graphModule();
  const original = createStandaloneTask('TEMU-1774029', 'REP-ORIG', { from: 'REP-A', to: 'REP-B' });
  const replacement = createStandaloneTask('TEMU-1774029', 'REP-NEW', { from: 'REP-A', to: 'REP-X' });
  let version = mod.taskGraphSnapshot().version;
  mod.declareTaskRelation({ type: 'replacement', fromTaskId: replacement, toTaskId: original, expectedVersion: version, fallbackPolicy: 'restore-alternative', reason: '改走新查验位' });
  version = mod.taskGraphSnapshot().version;
  mod.mergeDuplicateTasks({ survivorTaskId: replacement, duplicateTaskIds: [original], expectedVersion: version, reason: '执行替代计划' });
  version = mod.taskGraphSnapshot().version;
  mod.assignTask(replacement, { equipmentId: 'YC-05', expectedVersion: version });
  version = mod.taskGraphSnapshot().version;
  mod.transitionTask(replacement, { action: 'start', expectedVersion: version });
  version = mod.taskGraphSnapshot().version;
  mod.transitionTask(replacement, { action: 'fail', expectedVersion: version, reason: '设备故障' });
  const restored = mod.tasks.find((item: { id: string }) => item.id === original);
  assert.equal(restored?.status, 'queued');
  assert.equal(restored?.mergedInto, undefined);
  assert.ok(mod.taskDetail(original)?.task.explanation.some(line => line.includes('自动恢复')));
});

test('started tasks cannot be merged or silently reassigned while mutex keeps only winner executable', async () => {
  const mod = await graphModule();
  const a = createStandaloneTask('EISU-1288420', 'MUT-A', { priority: 90 });
  const b = createStandaloneTask('EISU-1288420', 'MUT-B', { priority: 50 });
  let version = mod.taskGraphSnapshot().version;
  mod.assignTask(a, { equipmentId: 'YC-05', expectedVersion: version });
  version = mod.taskGraphSnapshot().version;
  mod.transitionTask(a, { action: 'start', expectedVersion: version });
  assert.throws(() => mod.assignTask(a, { equipmentId: 'YC-12', expectedVersion: mod.taskGraphSnapshot().version }), /已开始/);
  const c = createStandaloneTask('EISU-1288420', 'MUT-C', { priority: 70 });
  const d = createStandaloneTask('EISU-1288420', 'MUT-D', { priority: 60 });
  version = mod.taskGraphSnapshot().version;
  mod.declareTaskRelation({ type: 'mutex', fromTaskId: c, toTaskId: d, expectedVersion: version, reason: '同一设备不可并行' });
  const graph = mod.taskGraphSnapshot();
  assert.equal(graph.queue.find((item: { id: string }) => item.id === d)?.suppressedBy?.otherTaskId, c);
  assert.ok(!graph.executableSet.includes(d));
  assert.ok(graph.audit.length > 0);
});
