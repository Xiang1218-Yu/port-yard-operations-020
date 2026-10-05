export type ContainerStatus = 'in-transit' | 'at-gate' | 'in-yard' | 'on-quay' | 'released' | 'hold';
export type EquipmentKind = 'quay-crane' | 'yard-crane' | 'terminal-truck' | 'reach-stacker';
export type TaskStatus = 'queued' | 'assigned' | 'executing' | 'blocked' | 'done' | 'cancelled' | 'failed';
export type AppointmentStatus = 'booked' | 'checked-in' | 'completed' | 'cancelled' | 'exception';

export interface Voyage { id: string; vessel: string; imo: string; service: string; eta: string; etd: string; status: 'approaching' | 'berthed' | 'loading' | 'departed'; berth: string; movesPlanned: number; movesDone: number; lateRisk: 'low' | 'medium' | 'high'; }
export interface Container { id: string; voyageId: string; size: '20' | '40' | '45'; isoType: string; direction: 'import' | 'export' | 'transshipment'; status: ContainerStatus; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released' | 'inspection' | 'hold'; priority: 'normal' | 'hot' | 'reefer' | 'hazmat'; yardSlot: string; appointmentId?: string; lastEvent: string; }
export interface YardBlock { id: string; zone: string; rows: number; tiers: number; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; equipment: EquipmentKind[]; heat: number; }
export interface GateAppointment { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup' | 'dropoff'; windowStart: string; windowEnd: string; lane: 'north' | 'south' | 'rail'; status: AppointmentStatus; sealVerified: boolean; weightVerified: boolean; exception?: string; }
export interface Equipment { id: string; name: string; kind: EquipmentKind; status: 'available' | 'working' | 'maintenance' | 'offline'; location: string; battery: number; queue: number; movesPerHour: number; }
export interface AuditEvent { id: string; actor: string; action: string; entity: string; entityId: string; at: string; details: string; graphVersion?: number; }

const start = Date.now(); const iso = (minutes: number) => new Date(start + minutes * 60000).toISOString();
export const voyages: Voyage[] = [
  { id: 'VOY-AX7', vessel: 'MSC Aurora', imo: 'IMO9382014', service: 'AE-3', eta: iso(-90), etd: iso(350), status: 'berthed', berth: 'B07', movesPlanned: 1240, movesDone: 886, lateRisk: 'medium' },
  { id: 'VOY-QF2', vessel: 'Ever Quartz', imo: 'IMO9721103', service: 'TP9', eta: iso(190), etd: iso(890), status: 'approaching', berth: 'B04', movesPlanned: 760, movesDone: 0, lateRisk: 'high' },
  { id: 'VOY-RD8', vessel: 'ONE Redwood', imo: 'IMO9812340', service: 'PNW', eta: iso(-700), etd: iso(-330), status: 'departed', berth: 'B02', movesPlanned: 520, movesDone: 520, lateRisk: 'low' }
];
export const blocks: YardBlock[] = [
  { id: 'A01', zone: 'North Import', rows: 14, tiers: 5, capacity: 280, occupied: 247, reeferPlugs: 18, usedPlugs: 16, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 78 },
  { id: 'B07', zone: 'Central Transshipment', rows: 18, tiers: 5, capacity: 360, occupied: 302, reeferPlugs: 24, usedPlugs: 19, hazmatAllowed: true, equipment: ['yard-crane', 'reach-stacker', 'terminal-truck'], heat: 91 },
  { id: 'C03', zone: 'Export Pre-staging', rows: 12, tiers: 4, capacity: 192, occupied: 128, reeferPlugs: 8, usedPlugs: 3, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 54 },
  { id: 'D05', zone: 'Inspection & Hold', rows: 8, tiers: 3, capacity: 96, occupied: 72, reeferPlugs: 5, usedPlugs: 4, hazmatAllowed: true, equipment: ['reach-stacker'], heat: 63 }
];
export const containers: Container[] = [
  { id: 'MSCU-4829017', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: 22.4, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'A01-R07-T3', lastEvent: '卸船完成 08:42' },
  { id: 'EISU-1288420', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 27.8, reefer: true, temperature: -18, customs: 'released', priority: 'reefer', yardSlot: 'B07-R03-T2', lastEvent: '温度回传正常 08:51' },
  { id: 'TGHU-9831204', voyageId: 'VOY-AX7', size: '20', isoType: '22K2', direction: 'transshipment', status: 'hold', weightT: 19.7, reefer: false, hazmatClass: '3', customs: 'inspection', priority: 'hazmat', yardSlot: 'D05-R02-T1', lastEvent: '海关查验挂起' },
  { id: 'OOLU-7734201', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'export', status: 'at-gate', weightT: 24.1, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R06-T1', appointmentId: 'APT-9001', lastEvent: '南闸口已称重' },
  { id: 'CMAU-6001722', voyageId: 'VOY-QF2', size: '40', isoType: '45G1', direction: 'import', status: 'in-transit', weightT: 23.5, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'B07-R10-T1', lastEvent: '船期 ETA +35min' },
  { id: 'FCIU-9920310', voyageId: 'VOY-QF2', size: '20', isoType: '22G1', direction: 'export', status: 'in-yard', weightT: 12.2, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R04-T2', lastEvent: '待装船' },
  { id: 'TEMU-1774029', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 26.3, reefer: true, temperature: 4, customs: 'inspection', priority: 'reefer', yardSlot: 'D05-R05-T1', lastEvent: '待海关查验' }
];
export const appointments: GateAppointment[] = [
  { id: 'APT-9001', containerId: 'OOLU-7734201', truckNo: '沪A·7K229', driver: '陈海', type: 'dropoff', windowStart: iso(-14), windowEnd: iso(16), lane: 'south', status: 'checked-in', sealVerified: true, weightVerified: true },
  { id: 'APT-9002', containerId: 'MSCU-4829017', truckNo: '苏E·66218', driver: '王建国', type: 'pickup', windowStart: iso(34), windowEnd: iso(64), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9003', containerId: 'EISU-1288420', truckNo: '沪B·02891', driver: '赵晨', type: 'pickup', windowStart: iso(38), windowEnd: iso(68), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9004', containerId: 'FCIU-9920310', truckNo: '沪A·7K229', driver: '陈海', type: 'pickup', windowStart: iso(4), windowEnd: iso(22), lane: 'south', status: 'booked', sealVerified: false, weightVerified: false, exception: '同一车辆相邻窗口过短' }
];
export const equipment: Equipment[] = [
  { id: 'QC-07', name: '岸桥 QC-07', kind: 'quay-crane', status: 'working', location: 'B07 / MSC Aurora', battery: 96, queue: 4, movesPerHour: 31 },
  { id: 'YC-12', name: '场桥 YC-12', kind: 'yard-crane', status: 'working', location: 'B07-R03', battery: 72, queue: 9, movesPerHour: 24 },
  { id: 'YC-05', name: '场桥 YC-05', kind: 'yard-crane', status: 'available', location: 'C03-R06', battery: 88, queue: 3, movesPerHour: 27 },
  { id: 'TT-31', name: '集卡 TT-31', kind: 'terminal-truck', status: 'working', location: '南闸口', battery: 61, queue: 2, movesPerHour: 8 },
  { id: 'RS-02', name: '正面吊 RS-02', kind: 'reach-stacker', status: 'maintenance', location: 'D05', battery: 34, queue: 0, movesPerHour: 14 }
];
const taskCreatedAt = (minutes: number) => new Date(start + minutes * 60000).toISOString();
const seedTask = (task: Omit<YardTask, 'sources' | 'graphVersion'>, sourceLabel: string): YardTask => ({ ...task, sources: [{ id: `SRC-${task.id}`, label: sourceLabel, createdAt: taskCreatedAt(-30) }], graphVersion: 0 });
export const tasks: YardTask[] = [
  seedTask({ id: 'TASK-101', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', equipmentId: 'YC-12', priority: 92, status: 'assigned', scheduledAt: iso(12), blockingReasons: [], estimatedMinutes: 18 }, '闸口提箱预约 APT-9002'),
  seedTask({ id: 'TASK-102', kind: 'rehandle', containerId: 'EISU-1288420', from: 'B07-R03-T2', to: 'D05-R05-T1', equipmentId: 'YC-12', priority: 88, status: 'queued', scheduledAt: iso(24), blockingReasons: ['查验区插件余量接近阈值'], estimatedMinutes: 26 }, '温控计划批次 REEFER-WATCH'),
  seedTask({ id: 'TASK-103', kind: 'inspect', containerId: 'TGHU-9831204', from: 'D05-R02-T1', to: 'D05-R02-T1', priority: 125, status: 'blocked', scheduledAt: iso(4), blockingReasons: ['RS-02 维护中', '待海关查验窗口'], estimatedMinutes: 32 }, '海关查验工单 CUS-771'),
  seedTask({ id: 'TASK-104', kind: 'load', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'B07 / VOY-QF2', equipmentId: 'YC-05', priority: 75, status: 'queued', scheduledAt: iso(76), blockingReasons: [], estimatedMinutes: 21 }, '装船清单 MANIFEST-QF2'),
  seedTask({ id: 'TASK-106', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 86, status: 'queued', scheduledAt: iso(14), blockingReasons: [], estimatedMinutes: 18 }, '集卡到场重复触发 TT-31'),
  seedTask({ id: 'TASK-107', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 84, status: 'queued', scheduledAt: iso(15), blockingReasons: [], estimatedMinutes: 18 }, '闸口手工补录'),
  seedTask({ id: 'TASK-108', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 80, status: 'cancelled', scheduledAt: iso(16), blockingReasons: [], estimatedMinutes: 18, mergedInto: 'TASK-101' }, 'TOS 接口重放'),
  seedTask({ id: 'TASK-110', kind: 'deliver', containerId: 'CMAU-6001722', from: '预卸船位', to: 'B07-R10-T1', priority: 82, status: 'queued', scheduledAt: iso(210), blockingReasons: [], estimatedMinutes: 19 }, '进口卸船预排'),
  seedTask({ id: 'TASK-111', kind: 'deliver', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'B07 / VOY-QF2', priority: 78, status: 'queued', scheduledAt: iso(77), blockingReasons: [], estimatedMinutes: 21 }, '装船无线电补发指令'),
  seedTask({ id: 'TASK-112', kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R06-T1', priority: 73, status: 'queued', scheduledAt: iso(2), blockingReasons: [], estimatedMinutes: 16 }, '闸口预约 APT-9001'),
  seedTask({ id: 'TASK-113', kind: 'deliver', containerId: 'CMAU-6001722', from: 'A01-R07-T3', to: '南闸口', priority: 51, status: 'queued', scheduledAt: iso(214), blockingReasons: [], estimatedMinutes: 18 }, '外轮 TOS 相似路径补录')
];
tasks.find(task => task.id === 'TASK-101')?.sources.push({ id: 'SRC-TASK-108', label: 'TOS 接口重放', createdAt: taskCreatedAt(-30), originalTaskId: 'TASK-108' });
export const auditEvents: AuditEvent[] = [
  { id: 'AUD-500', actor: '中控调度员', action: 'REPLAN', entity: 'voyage', entityId: 'VOY-AX7', at: new Date(start - 20 * 60000).toISOString(), details: '因 QC-07 瞬时降速，重新计算 14 个高优先级作业' },
  { id: 'AUD-601', actor: '系统去重', action: 'TASK_MERGE', entity: 'yard-task', entityId: 'TASK-101', at: taskCreatedAt(-18), details: 'TASK-108 与 TASK-101 箱号/航次/类型/路径完全一致，合并到 TASK-101；来源：TOS 接口重放', graphVersion: 1 },
  { id: 'AUD-602', actor: '中控调度员', action: 'TASK_RELATION_ADD', entity: 'task-relation', entityId: 'REL-SEED-001', at: taskCreatedAt(-12), details: 'TASK-104 前置 TASK-102：冷藏箱查验移位完成后再装船', graphVersion: 1 }
];

export type RelationType = 'predecessor' | 'mutex' | 'replacement';
export type RelationStatus = 'active' | 'superseded' | 'cancelled' | 'failed';
export type FallbackPolicy = 'manual-review' | 'restore-alternative';
export interface TaskSource { id: string; label: string; createdAt: string; originalTaskId?: string; }
export interface YardTask { id: string; kind: 'receive' | 'deliver' | 'rehandle' | 'load' | 'discharge' | 'inspect'; containerId: string; from: string; to: string; equipmentId?: string; priority: number; status: TaskStatus; scheduledAt: string; blockingReasons: string[]; estimatedMinutes: number; sources: TaskSource[]; mergedInto?: string; graphVersion: number; }
export interface TaskRelation { id: string; type: RelationType; fromTaskId: string; toTaskId: string; status: RelationStatus; actor: string; reason: string; createdAt: string; updatedAt: string; fallbackPolicy?: FallbackPolicy; }
export interface TaskMergeRecord { id: string; survivorTaskId: string; mergedTaskIds: string[]; reason: string; actor: string; at: string; preservedSources: TaskSource[]; graphVersion: number; }
export interface GraphAudit { id: string; graphVersion: number; action: string; actor: string; at: string; entityId: string; details: string; }
export interface RelationInput { type: RelationType; fromTaskId: string; toTaskId: string; actor?: string; reason?: string; fallbackPolicy?: FallbackPolicy; expectedVersion: number; }
export interface MergeInput { survivorTaskId: string; duplicateTaskIds: string[]; reason?: string; actor?: string; expectedVersion: number; }
export interface TaskTransitionInput { action: 'start' | 'complete' | 'fail' | 'cancel'; actor?: string; reason?: string; expectedVersion?: number; }
export interface ReassignInput { equipmentId?: string; actor?: string; reason?: string; expectedVersion: number; }

export const taskRelations: TaskRelation[] = [];
export const taskMergeRecords: TaskMergeRecord[] = [
  { id: 'MRG-SEED-001', survivorTaskId: 'TASK-101', mergedTaskIds: ['TASK-108'], reason: '同箱同航次同路径的重复提箱计划', actor: '系统去重', at: taskCreatedAt(-18), preservedSources: [{ id: 'SRC-TASK-108', label: 'TOS 接口重放', createdAt: taskCreatedAt(-30), originalTaskId: 'TASK-108' }], graphVersion: 1 }
];
export const graphAuditLog: GraphAudit[] = [
  { id: 'GAUD-001', graphVersion: 1, action: 'TASK_MERGE', actor: '系统去重', at: taskCreatedAt(-18), entityId: 'TASK-101', details: 'TASK-108 合并入 TASK-101，保留来源 TOS 接口重放' },
];
let graphVersion = 1;
let nextTaskSequence = 200;
let nextGraphAuditId = 2;
const terminalStatuses: TaskStatus[] = ['done', 'cancelled', 'failed'];
const startedStatuses: TaskStatus[] = ['executing', 'done', 'failed'];
const activeTaskStatuses: TaskStatus[] = ['queued', 'assigned', 'executing', 'blocked'];
const statusText: Record<TaskStatus, string> = { queued: '排队', assigned: '已指派', executing: '执行中', blocked: '阻塞', done: '已完成', cancelled: '已取消', failed: '失败' };


function parseSlot(slot: string) { const match = slot.match(/^([A-Z]\d\d)-/); return match?.[1]; }
export function dashboard() {
  const activeVoyages = voyages.filter(v => v.status !== 'departed');
  const yardCapacity = blocks.reduce((sum, block) => sum + block.capacity, 0); const yardOccupied = blocks.reduce((sum, block) => sum + block.occupied, 0);
  const graph = taskGraphSnapshot();
  return { activeVoyages: activeVoyages.length, berthMoves: activeVoyages.reduce((sum, v) => sum + v.movesPlanned - v.movesDone, 0), yardUtilization: yardOccupied / yardCapacity, gateQueue: appointments.filter(a => a.status === 'checked-in').length + 7, pendingTasks: tasks.filter(t => !['done', 'cancelled', 'failed'].includes(t.status)).length, blockedTasks: graph.queue.filter(t => t.status === 'blocked' || (!t.readyToDispatch && t.status !== 'done' && !t.mergedInto && !t.suppressedBy)).length, reeferAlerts: containers.filter(c => c.reefer && (c.customs === 'inspection' || (c.temperature ?? 0) > 5)).length, hazmatHolds: containers.filter(c => c.hazmatClass && c.customs !== 'released').length, lateVessels: activeVoyages.filter(v => v.lateRisk === 'high').length };
}
export function gateConflicts() {
  const result: { severity: 'critical' | 'warning'; appointmentId: string; reason: string }[] = [];
  appointments.forEach((a, index) => appointments.slice(index + 1).forEach(b => {
    const overlap = a.truckNo === b.truckNo && new Date(a.windowStart).getTime() < new Date(b.windowEnd).getTime() && new Date(b.windowStart).getTime() < new Date(a.windowEnd).getTime();
    if (overlap) result.push({ severity: 'critical', appointmentId: a.id, reason: `车辆 ${a.truckNo} 与 ${b.id} 时间窗口重叠，需重新分配闸口时隙` });
  }));
  appointments.filter(a => a.status === 'booked').forEach(a => { const container = containers.find(c => c.id === a.containerId); if (container?.customs !== 'released') result.push({ severity: 'warning', appointmentId: a.id, reason: `箱 ${a.containerId} 海关状态为 ${container?.customs}，无法无条件放行` }); });
  return result;
}
export function yardHeatmap() { return blocks.map(block => ({ ...block, utilization: block.occupied / block.capacity, freeSlots: block.capacity - block.occupied, pressure: block.heat > 85 ? 'critical' : block.heat > 65 ? 'warning' : 'normal' })); }
export function containerPlan(containerId: string) {
  const container = containers.find(c => c.id === containerId); if (!container) return undefined;
  const reasons: string[] = []; const candidates = blocks.filter(block => block.capacity > block.occupied && (!container.hazmatClass || block.hazmatAllowed) && (!container.reefer || block.reeferPlugs > block.usedPlugs));
  if (container.customs !== 'released' && container.status === 'in-yard') reasons.push('海关未放行，必须保持在查验/监管区');
  const ranked = candidates.map(block => ({ block, score: (block.capacity - block.occupied) * 2 - block.heat - (container.reefer && block.reeferPlugs - block.usedPlugs < 3 ? 18 : 0) - (container.hazmatClass && !block.hazmatAllowed ? 100 : 0) })).sort((a, b) => b.score - a.score);
  if (!ranked.length) reasons.push('没有同时满足危险品、冷藏电源与容量约束的区块');
  const selected = ranked[0]?.block; if (container.reefer && selected) reasons.push(`需要占用 ${selected.reeferPlugs - selected.usedPlugs} 个剩余冷插位中的 1 个`);
  if (container.hazmatClass) reasons.push(`危险品 ${container.hazmatClass} 级，只能进入有隔离资质的区块`);
  return { container, recommendedBlock: selected, alternatives: ranked.slice(1, 3).map(item => item.block), reasons };
}
export function prioritizeTasks() { return taskGraphSnapshot().queue; }
export function createAppointment(input: Omit<GateAppointment, 'id' | 'status' | 'sealVerified' | 'weightVerified'>) {
  const container = containers.find(item => item.id === input.containerId); if (!container) throw new Error('箱号不存在');
  if (container.customs !== 'released' && input.type === 'pickup') throw new Error('海关未放行，不能预约提箱');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false }; appointments.unshift(item); container.appointmentId = item.id; return item;
}
export function updateAppointment(id: string, patch: Partial<Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) { const item = appointments.find(a => a.id === id); if (!item) return undefined; Object.assign(item, patch); const container = containers.find(c => c.id === item.containerId); if (item.status === 'checked-in' && container) container.status = 'at-gate'; if (item.status === 'completed' && container) container.status = item.type === 'pickup' ? 'released' : 'in-yard'; auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '闸口值班员', action: 'GATE_UPDATE', entity: 'appointment', entityId: id, at: new Date().toISOString(), details: JSON.stringify(patch) }); return item; }
export function assignTask(id: string, input: ReassignInput) { return reassignTask(id, input); }
export function containerDetail(id: string) { const container = containers.find(item => item.id === id); if (!container) return undefined; const graph = taskGraphSnapshot(); return { container, voyage: voyages.find(v => v.id === container.voyageId), appointment: appointments.find(a => a.id === container.appointmentId), plan: containerPlan(id), tasks: graph.queue.filter(t => t.containerId === id), graphVersion: graph.version, executableSet: graph.executableSet }; }

type ActiveRelationKind = Extract<RelationType, 'predecessor' | 'mutex' | 'replacement'>;
interface Resolution {
  task: YardTask;
  state: TaskStatus;
  blockers: string[];
  dependencyBlockers: string[];
  suppressedBy?: { type: RelationType; relationId: string; otherTaskId: string; reason: string };
  cycle: boolean;
  duplicateKey?: string;
}
export interface TaskQueueItem extends YardTask {
  voyageId: string;
  score: number;
  state: TaskStatus;
  executable: boolean;
  readyToDispatch: boolean;
  dependencyBlockers: string[];
  blockers: string[];
  explanation: string[];
  suppressedBy?: Resolution['suppressedBy'];
  dependencyCycle: boolean;
  duplicateOf: string[];
  preservedSources: TaskSource[];
}
export interface TaskGraphSnapshot {
  version: number;
  queue: TaskQueueItem[];
  executableSet: string[];
  readyToDispatch: string[];
  relations: TaskRelation[];
  mergeRecords: TaskMergeRecord[];
  audit: GraphAudit[];
  duplicateGroups: { key: string; taskIds: string[]; containerId: string; voyageId: string; kind: YardTask['kind']; from: string; to: string; safeToMerge: boolean }[];
  nearDuplicateGuards: { reason: string; taskIds: string[] }[];
  cycleGroups: string[][];
  summary: { total: number; active: number; executable: number; ready: number; suppressed: number; blocked: number; merged: number };
}

const getTask = (id: string) => tasks.find(task => task.id === id);
const getContainer = (id: string) => containers.find(container => container.id === id);
const activeRelations = (type?: ActiveRelationKind) => taskRelations.filter(relation => relation.status === 'active' && (!type || relation.type === type));
const isStarted = (task: YardTask) => startedStatuses.includes(task.status);
const isTerminal = (task: YardTask) => terminalStatuses.includes(task.status);
const isActiveTask = (task: YardTask) => activeTaskStatuses.includes(task.status);
const sameTaskIdentity = (a: YardTask, b: YardTask) => {
  const ca = getContainer(a.containerId); const cb = getContainer(b.containerId);
  return a.containerId === b.containerId && ca?.voyageId === cb?.voyageId;
};
const duplicateKey = (task: YardTask) => `${task.containerId}|${getContainer(task.containerId)?.voyageId ?? 'UNKNOWN'}|${task.kind}|${task.from}|${task.to}`;

class GraphConflictError extends Error {
  code: 'VERSION_CONFLICT' | 'VALIDATION';
  currentVersion: number;
  constructor(message: string, code: 'VERSION_CONFLICT' | 'VALIDATION' = 'VALIDATION') {
    super(message);
    this.name = 'GraphConflictError';
    this.code = code;
    this.currentVersion = graphVersion;
  }
}

function ensureExpectedVersion(expected: number) {
  if (!Number.isInteger(expected)) throw new GraphConflictError('expectedVersion 必须是整数，用于防止两名调度员同时合并', 'VALIDATION');
  if (expected !== graphVersion) throw new GraphConflictError(`任务图版本已变化：当前 v${graphVersion}，提交基于 v${expected}，请刷新后重试`, 'VERSION_CONFLICT');
}
function bumpGraph(action: string, actor: string, entityId: string, details: string) {
  graphVersion += 1;
  tasks.forEach(task => { task.graphVersion = graphVersion; });
  const entry: GraphAudit = { id: `GAUD-${String(nextGraphAuditId++).padStart(3, '0')}`, graphVersion, action, actor, at: new Date().toISOString(), entityId, details };
  graphAuditLog.unshift(entry);
  auditEvents.unshift({ id: `AUD-${Date.now()}-${graphVersion}`, actor, action, entity: 'task-graph', entityId, at: entry.at, details, graphVersion });
  return entry;
}
function requireTask(id: string) {
  const task = getTask(id);
  if (!task) throw new GraphConflictError(`作业任务 ${id} 不存在`);
  return task;
}
function validateSameContainerVoyage(a: YardTask, b: YardTask, action: string) {
  if (!sameTaskIdentity(a, b)) {
    const voyageA = getContainer(a.containerId)?.voyageId ?? '未知航次';
    const voyageB = getContainer(b.containerId)?.voyageId ?? '未知航次';
    throw new GraphConflictError(`${action}被拒绝：${a.id}(${a.containerId}/${voyageA}) 与 ${b.id}(${b.containerId}/${voyageB}) 不属于同一箱号和航次`);
  }
}
function predecessorSuccessors(taskId: string) {
  const seen = new Set<string>();
  const walk = (id: string) => {
    activeRelations('predecessor').filter(edge => edge.fromTaskId === id).forEach(edge => {
      if (!seen.has(edge.toTaskId)) { seen.add(edge.toTaskId); walk(edge.toTaskId); }
    });
  };
  walk(taskId);
  return seen;
}
function detectPredecessorCycle() {
  const edges = activeRelations('predecessor');
  const visiting = new Set<string>(); const visited = new Set<string>(); const cycles: string[][] = [];
  const dfs = (id: string, trail: string[]) => {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      cycles.push([...trail.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    edges.filter(edge => edge.fromTaskId === id).forEach(edge => dfs(edge.toTaskId, [...trail, id]));
    visiting.delete(id); visited.add(id);
  };
  tasks.forEach(task => dfs(task.id, []));
  return cycles;
}
function findPredecessorCycle(fromId: string, toId: string) {
  const seen = new Set<string>();
  const dfs = (id: string): boolean => { if (id === fromId) return true; if (seen.has(id)) return false; seen.add(id); return activeRelations('predecessor').filter(edge => edge.fromTaskId === id).some(edge => dfs(edge.toTaskId)); };
  return dfs(toId);
}
function mergeSources(parts: YardTask[]) {
  const byOriginal = new Map<string, TaskSource>();
  parts.forEach(task => task.sources.forEach(source => {
    const original = source.originalTaskId ?? task.id;
    const current = byOriginal.get(original);
    if (!current || current.label !== source.label) byOriginal.set(original, { ...source, originalTaskId: original });
  }));
  return [...byOriginal.values()];
}
function rewriteRelationsForMerge(survivor: YardTask, mergedIds: string[]) {
  for (const relation of taskRelations) {
    if (relation.status !== 'active') continue;
    // A replacement edge must retain the cancelled original so failure can restore that exact plan.
    if (relation.type === 'replacement' && relation.fromTaskId === survivor.id && mergedIds.includes(relation.toTaskId)) continue;
    if (mergedIds.includes(relation.fromTaskId)) relation.fromTaskId = survivor.id;
    if (mergedIds.includes(relation.toTaskId)) relation.toTaskId = survivor.id;
    if (relation.fromTaskId === relation.toTaskId) {
      relation.status = 'superseded';
      relation.reason = `${relation.reason}；合并后首尾任务相同，自动失效`;
      relation.updatedAt = new Date().toISOString();
    }
  }
  const seen = new Set<string>();
  for (const relation of taskRelations) {
    if (relation.status !== 'active') continue;
    const key = `${relation.type}:${relation.fromTaskId}:${relation.toTaskId}`;
    if (seen.has(key)) {
      relation.status = 'superseded';
      relation.reason = `${relation.reason}；合并后与另一条关系重复`;
      relation.updatedAt = new Date().toISOString();
    } else seen.add(key);
  }
}
export function mergeDuplicateTasks(input: MergeInput) {
  ensureExpectedVersion(input.expectedVersion);
  const actor = input.actor?.trim() || '中控调度员';
  const reason = input.reason?.trim() || '调度员确认重复计划';
  const survivor = requireTask(input.survivorTaskId);
  const duplicateIds = [...new Set(input.duplicateTaskIds ?? [])];
  if (!duplicateIds.length) throw new GraphConflictError('请至少选择一个被合并任务');
  if (duplicateIds.includes(survivor.id)) throw new GraphConflictError('保留任务不能同时出现在被合并列表中');
  const merged = duplicateIds.map(requireTask);
  if (isStarted(survivor)) throw new GraphConflictError(`保留任务 ${survivor.id} 已开始，不能通过合并撤销或改写`);
  for (const task of merged) {
    if (isStarted(task)) throw new GraphConflictError(`被合并任务 ${task.id} 已开始，不能撤销；只能通过完成/失败流程处理`);
    validateSameContainerVoyage(survivor, task, '合并');
    const exact = task.kind === survivor.kind && task.from === survivor.from && task.to === survivor.to;
    const hasReplacement = taskRelations.some(edge => edge.status === 'active' && edge.type === 'replacement' && ((edge.fromTaskId === survivor.id && edge.toTaskId === task.id) || (edge.fromTaskId === task.id && edge.toTaskId === survivor.id)));
    if (!exact && !hasReplacement) throw new GraphConflictError(`${task.id} 与保留任务的类型或路径不同；自动合并仅允许完全重复计划，替代计划请先声明 replacement`);
  }
  const previousSources = mergeSources([survivor, ...merged]);
  const previousIds = merged.map(task => task.id);
  merged.forEach(task => {
    task.status = 'cancelled';
    task.mergedInto = survivor.id;
    task.blockingReasons = [];
    task.equipmentId = undefined;
  });
  if (survivor.status === 'blocked' && survivor.blockingReasons.some(item => item.startsWith('设备约束：'))) survivor.status = survivor.equipmentId ? 'assigned' : 'queued';
  survivor.sources = previousSources;
  rewriteRelationsForMerge(survivor, previousIds);
  const record: TaskMergeRecord = { id: `MRG-${Date.now()}`, survivorTaskId: survivor.id, mergedTaskIds: previousIds, reason, actor, at: new Date().toISOString(), preservedSources: previousSources, graphVersion: graphVersion + 1 };
  taskMergeRecords.unshift(record);
  bumpGraph('TASK_MERGE', actor, survivor.id, `${previousIds.join('、')} 合并入 ${survivor.id}；原因：${reason}；保留来源 ${previousSources.map(source => source.originalTaskId ?? source.label).join('、')}`);
  return taskGraphSnapshot();
}
export function declareTaskRelation(input: RelationInput) {
  ensureExpectedVersion(input.expectedVersion);
  const actor = input.actor?.trim() || '中控调度员';
  const reason = input.reason?.trim() || '调度员声明任务关系';
  if (!input.fromTaskId || !input.toTaskId || input.fromTaskId === input.toTaskId) throw new GraphConflictError('关系必须连接两个不同任务');
  const from = requireTask(input.fromTaskId); const to = requireTask(input.toTaskId);
  if (input.type !== 'predecessor') validateSameContainerVoyage(from, to, input.type === 'mutex' ? '互斥声明' : '替代声明');
  if (!isActiveTask(from) || !isActiveTask(to)) throw new GraphConflictError('只有排队、已指派、执行中或阻塞任务可以声明新关系；已终态任务请新建计划');
  if (isStarted(from) || isStarted(to)) throw new GraphConflictError('已开始或已失败/完成的任务不能再建立新的依赖/互斥/替代关系');
  const existing = taskRelations.find(edge => edge.status === 'active' && edge.type === input.type && edge.fromTaskId === from.id && edge.toTaskId === to.id);
  if (existing) throw new GraphConflictError('相同关系已经存在，不能重复声明');
  if (input.type === 'predecessor' && predecessorSuccessors(from.id).has(to.id)) {
    throw new GraphConflictError(`${from.id} 已经是 ${to.id} 的间接前置；依赖链不应重复`);
  }
  if (input.type === 'predecessor' && findPredecessorCycle(from.id, to.id)) throw new GraphConflictError(`添加前置 ${from.id} → ${to.id} 会形成依赖环，已拒绝`);
  const relation: TaskRelation = { id: `REL-${Date.now()}`, type: input.type, fromTaskId: from.id, toTaskId: to.id, status: 'active', actor, reason, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(input.type === 'replacement' ? { fallbackPolicy: input.fallbackPolicy ?? 'manual-review' } : {}) };
  taskRelations.unshift(relation);
  const cycles = detectPredecessorCycle();
  if (cycles.length) {
    const index = taskRelations.indexOf(relation);
    if (index >= 0) taskRelations.splice(index, 1);
    throw new GraphConflictError(`依赖环检测失败：${cycles[0].join(' → ')}；关系未写入`);
  }
  const label = input.type === 'predecessor' ? '前置' : input.type === 'mutex' ? '互斥' : '替代';
  bumpGraph('TASK_RELATION_ADD', actor, relation.id, `声明${label}：${from.id} ${input.type === 'predecessor' ? '→' : input.type === 'mutex' ? '⊕' : '⇄'} ${to.id}；${reason}`);
  return taskGraphSnapshot();
}
function resolveTaskGraph() {
  const cycles = detectPredecessorCycle();
  const cycleIds = new Set(cycles.flat());
  const resolution = new Map<string, Resolution>();
  tasks.forEach(task => resolution.set(task.id, { task, state: task.status, blockers: [], dependencyBlockers: [], cycle: cycleIds.has(task.id) }));
  const mergedRoots = new Map<string, string>();
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    while (true) {
      if (seen.has(current)) return current;
      seen.add(current);
      const task = getTask(current);
      if (!task?.mergedInto) return current;
      current = task.mergedInto;
    }
  };
  tasks.forEach(task => mergedRoots.set(task.id, rootOf(task.id)));

  activeRelations('replacement').forEach(edge => {
    const replacement = resolution.get(edge.fromTaskId); const original = resolution.get(edge.toTaskId);
    if (!replacement || !original) return;
    if (['queued', 'assigned', 'executing', 'done'].includes(replacement.state)) {
      original.suppressedBy = { type: 'replacement', relationId: edge.id, otherTaskId: replacement.task.id, reason: `已由替代任务 ${replacement.task.id} 接管（${edge.reason}）` };
    }
  });

  const mutexEdges = activeRelations('mutex');
  const handledEdges = new Set<string>();
  mutexEdges.forEach(edge => {
    if (handledEdges.has(edge.id)) return;
    const groupIds = new Set([edge.fromTaskId, edge.toTaskId]);
    let changed = true;
    while (changed) {
      changed = false;
      mutexEdges.forEach(item => {
        if (groupIds.has(item.fromTaskId) && !groupIds.has(item.toTaskId)) { groupIds.add(item.toTaskId); changed = true; }
        if (groupIds.has(item.toTaskId) && !groupIds.has(item.fromTaskId)) { groupIds.add(item.fromTaskId); changed = true; }
      });
    }
    mutexEdges.forEach(item => { if (groupIds.has(item.fromTaskId) && groupIds.has(item.toTaskId)) handledEdges.add(item.id); });
    const members = [...groupIds].map(id => resolution.get(id)).filter((item): item is Resolution => item !== undefined && isActiveTask(item.task) && !item.suppressedBy);
    if (members.length < 2) return;
    const rank = (item: Resolution) => item.state === 'executing' ? 4 : item.state === 'assigned' ? 3 : item.state === 'queued' ? 2 : 1;
    const winner = [...members].sort((a, b) => rank(b) - rank(a) || b.task.priority - a.task.priority || new Date(a.task.scheduledAt).getTime() - new Date(b.task.scheduledAt).getTime() || a.task.id.localeCompare(b.task.id))[0];
    members.filter(item => item !== winner && ['queued', 'assigned'].includes(item.state)).forEach(item => {
      item.suppressedBy = { type: 'mutex', relationId: edge.id, otherTaskId: winner.task.id, reason: `互斥集合当前选择 ${winner.task.id}（优先级 ${winner.task.priority}），本任务暂不执行` };
    });
  });

  tasks.forEach(task => {
    const item = resolution.get(task.id)!;
    activeRelations('predecessor').filter(edge => edge.toTaskId === task.id).forEach(edge => {
      const predecessor = getTask(edge.fromTaskId);
      if (!predecessor) return;
      if (predecessor.status === 'done') return;
      if (predecessor.status === 'cancelled' && predecessor.mergedInto) return;
      if (predecessor.status === 'cancelled') item.dependencyBlockers.push(`前置 ${predecessor.id} 已取消，需改派或重建计划`);
      else if (predecessor.status === 'failed') item.dependencyBlockers.push(`前置 ${predecessor.id} 失败，需处置后再执行`);
      else item.dependencyBlockers.push(`等待前置 ${predecessor.id}（${statusText[predecessor.status]}）完成`);
      item.dependencyBlockers.push(...predecessor.blockingReasons.filter(reason => reason.includes('已取消，需改派') && !item.dependencyBlockers.includes(reason)));
    });
    if (item.cycle) item.dependencyBlockers.push('位于前置依赖环中，调度器已暂停环上任务');
    const manualReasons = task.blockingReasons.filter(reason => !reason.startsWith('设备约束：'));
    item.blockers.push(...item.dependencyBlockers, ...manualReasons);
  });
  return { cycles, resolution, mergedRoots };
}
export function taskGraphSnapshot(): TaskGraphSnapshot {
  const { cycles, resolution, mergedRoots } = resolveTaskGraph();
  const queue: TaskQueueItem[] = tasks.map(task => {
    const item = resolution.get(task.id)!;
    const container = getContainer(task.containerId);
    const merged = Boolean(task.mergedInto);
    const blockedByDependency = item.dependencyBlockers.length > 0;
    const manualReasons = task.blockingReasons.filter(reason => !reason.startsWith('设备约束：'));
    const executable = isActiveTask(task) && !merged && !item.suppressedBy && !blockedByDependency && manualReasons.length === 0;
    const readyToDispatch = executable && ['queued', 'assigned'].includes(task.status) && task.blockingReasons.length === 0;
    const explanation: string[] = [];
    if (merged) explanation.push(`已合并入 ${task.mergedInto}，当前不单独执行；来源仍保留在保留任务中`);
    if (item.suppressedBy) explanation.push(item.suppressedBy.reason);
    explanation.push(...item.dependencyBlockers);
    manualReasons.forEach(reason => explanation.push(`作业约束：${reason}`));
    task.blockingReasons.filter(reason => reason.startsWith('设备约束：')).forEach(reason => explanation.push(reason));
    if (executable && !readyToDispatch) explanation.push(task.blockingReasons.some(reason => reason.startsWith('设备约束：')) ? '依赖已满足，但当前设备不可执行，需要重新指派设备' : '依赖已满足，等待设备派工');
    if (readyToDispatch) explanation.push(task.equipmentId ? `依赖和作业约束均已满足，设备 ${task.equipmentId} 可立即执行` : '依赖和作业约束均已满足，可立即分配设备');
    const sources = task.sources.map(source => source.originalTaskId && source.originalTaskId !== task.id ? source : source);
    return { ...task, voyageId: container?.voyageId ?? 'UNKNOWN', score: task.priority + (task.blockingReasons.length ? -20 : 10) + (task.kind === 'inspect' ? 12 : 0), state: item.suppressedBy || merged ? (merged ? 'cancelled' : task.status) : task.status, executable, readyToDispatch, dependencyBlockers: item.dependencyBlockers, blockers: item.blockers, explanation, suppressedBy: item.suppressedBy, dependencyCycle: item.cycle, duplicateOf: [], preservedSources: sources };
  }).sort((a, b) => b.score - a.score || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const groupsMap = new Map<string, TaskQueueItem[]>();
  queue.filter(task => isActiveTask(task) && !task.mergedInto && !task.suppressedBy).forEach(task => {
    const key = duplicateKey(task);
    groupsMap.set(key, [...(groupsMap.get(key) ?? []), task]);
  });
  const duplicateGroups = [...groupsMap.values()].filter(group => group.length > 1).map(group => {
    const first = group[0];
    return { key: duplicateKey(first), taskIds: group.map(task => task.id), containerId: first.containerId, voyageId: first.voyageId, kind: first.kind, from: first.from, to: first.to, safeToMerge: true };
  });
  duplicateGroups.forEach(group => group.taskIds.forEach(id => { const item = queue.find(task => task.id === id); if (item) item.duplicateOf = group.taskIds.filter(other => other !== id); }));

  const nearDuplicateGuards: TaskGraphSnapshot['nearDuplicateGuards'] = [];
  const comparable = queue.filter(task => isActiveTask(task) && !task.mergedInto);
  comparable.forEach((a, index) => comparable.slice(index + 1).forEach(b => {
    if (a.kind === b.kind && a.from === b.from && a.to === b.to && !(a.containerId === b.containerId && a.voyageId === b.voyageId)) {
      nearDuplicateGuards.push({ reason: `路径和类型相似但 ${a.id} 属于 ${a.containerId}/${a.voyageId}，${b.id} 属于 ${b.containerId}/${b.voyageId}，禁止误合并`, taskIds: [a.id, b.id] });
    }
  }));

  const executableSet = queue.filter(task => task.executable).map(task => task.id);
  const readyToDispatch = queue.filter(task => task.readyToDispatch).map(task => task.id);
  return {
    version: graphVersion, queue, executableSet, readyToDispatch,
    relations: [...taskRelations], mergeRecords: [...taskMergeRecords], audit: [...graphAuditLog],
    duplicateGroups, nearDuplicateGuards, cycleGroups: cycles,
    summary: { total: tasks.length, active: tasks.filter(isActiveTask).length, executable: executableSet.length, ready: readyToDispatch.length, suppressed: queue.filter(task => task.suppressedBy).length, blocked: queue.filter(task => task.blockers.length > 0 || task.status === 'blocked').length, merged: tasks.filter(task => task.mergedInto).length }
  };
}
function restoreAlternativeAfterFailure(failedTask: YardTask, actor: string, reason: string) {
  const changed: { task: YardTask; relation: TaskRelation }[] = [];
  let needsManualReview = false;
  taskRelations.filter(edge => edge.status === 'active' && edge.type === 'replacement' && edge.fromTaskId === failedTask.id).forEach(edge => {
    const original = getTask(edge.toTaskId);
    edge.status = 'failed'; edge.updatedAt = new Date().toISOString();
    if (edge.fallbackPolicy === 'restore-alternative' && original) {
      const wasMerged = original.mergedInto === failedTask.id;
      original.mergedInto = undefined;
      original.status = original.equipmentId ? 'assigned' : 'queued';
      original.blockingReasons = original.blockingReasons.filter(item => !item.includes(`替代任务 ${failedTask.id} 失败`));
      if (wasMerged) original.blockingReasons.push(`替代任务 ${failedTask.id} 失败，已自动恢复原计划，等待确认设备`);
      changed.push({ task: original, relation: edge });
    } else if (original) {
      needsManualReview = true;
      const marker = `替代任务 ${failedTask.id} 失败，需人工选择恢复方案`;
      original.blockingReasons = [...original.blockingReasons.filter(item => !item.includes(`替代任务 ${failedTask.id} 失败`)), marker];
    }
  });
  changed.forEach(({ task, relation }) => bumpGraph('TASK_REPLACEMENT_FALLBACK', actor, task.id, `${reason}；替代关系 ${relation.id} 失败，按 restore-alternative 恢复原任务 ${task.id}`));
  if (needsManualReview) bumpGraph('TASK_REPLACEMENT_MANUAL_REVIEW', actor, failedTask.id, `${reason}；替代任务失败且策略为人工复核，原计划保持抑制并等待调度员处理`);
}
function handlePredecessorCancellation(task: YardTask, actor: string, reason: string) {
  const successors = [...predecessorSuccessors(task.id)].map(requireTask);
  successors.forEach(successor => {
    const marker = `前置 ${task.id} 已取消，需改派或重建计划`;
    if (!successor.blockingReasons.includes(marker)) successor.blockingReasons.push(marker);
    if (!['blocked', 'cancelled', 'failed', 'done'].includes(successor.status)) successor.status = 'blocked';
  });
  if (successors.length) bumpGraph('TASK_DEPENDENCY_CANCELLED', actor, task.id, `${reason}；下游 ${successors.map(item => item.id).join('、')} 被标记为等待改派`);
}
export function transitionTask(id: string, input: TaskTransitionInput) {
  if (input.expectedVersion !== undefined) ensureExpectedVersion(input.expectedVersion);
  const task = requireTask(id);
  const actor = input.actor?.trim() || '现场操作员';
  const reason = input.reason?.trim() || input.action;
  const graph = taskGraphSnapshot();
  const current = graph.queue.find(item => item.id === id);
  if (current?.suppressedBy || task.mergedInto) throw new GraphConflictError('被互斥、替代或合并抑制的任务不在可执行集合中，不能直接执行');
  if (input.action === 'start') {
    if (isStarted(task)) throw new GraphConflictError('任务已经开始，不能重复开始');
    if (!current?.executable) throw new GraphConflictError(`任务尚未满足执行条件：${current?.explanation.join('；') ?? '未知原因'}`);
    if (!task.equipmentId) throw new GraphConflictError('任务尚未指派设备，不能开始执行');
    if (task.blockingReasons.length) throw new GraphConflictError(`任务仍有执行阻塞：${task.blockingReasons.join('；')}`);
    task.status = 'executing';
    task.blockingReasons = task.blockingReasons.filter(item => item.startsWith('设备约束：'));
    bumpGraph('TASK_START', actor, id, `任务开始执行；${reason}`);
  } else if (input.action === 'complete') {
    if (task.status !== 'executing') throw new GraphConflictError('只有执行中的任务可以完成');
    task.status = 'done'; task.blockingReasons = [];
    bumpGraph('TASK_COMPLETE', actor, id, `任务完成；${reason}`);
  } else if (input.action === 'fail') {
    if (!isStarted(task)) throw new GraphConflictError('只有已开始任务可以登记失败');
    task.status = 'failed';
    bumpGraph('TASK_FAIL', actor, id, `任务失败；${reason}`);
    restoreAlternativeAfterFailure(task, actor, reason);
  } else if (input.action === 'cancel') {
    if (isStarted(task)) throw new GraphConflictError('任务已开始，不可撤销；请登记失败或异常处置');
    task.status = 'cancelled'; task.blockingReasons = [];
    bumpGraph('TASK_CANCEL', actor, id, `任务取消；${reason}`);
    handlePredecessorCancellation(task, actor, reason);
  }
  return taskGraphSnapshot();
}
export function reassignTask(id: string, input: ReassignInput) {
  ensureExpectedVersion(input.expectedVersion);
  const graphBefore = taskGraphSnapshot();
  const current = graphBefore.queue.find(item => item.id === id);
  const task = requireTask(id);
  if (current?.suppressedBy || task.mergedInto) throw new GraphConflictError('被互斥、替代或合并抑制的任务不参与设备指派');
  if (isStarted(task)) throw new GraphConflictError('任务已开始，设备重新指派必须走现场改派/异常流程，不能静默覆盖');
  const actor = input.actor?.trim() || '中控调度员';
  const reason = input.reason?.trim() || '设备重新指派';
  const manual = task.blockingReasons.filter(item => !item.startsWith('设备约束：'));
  const equipmentId = input.equipmentId?.trim() || undefined;
  let nextStatus: TaskStatus = task.status;
  if (equipmentId) {
    const machine = equipment.find(item => item.id === equipmentId);
    if (!machine) throw new GraphConflictError('设备不存在');
    if (machine.status === 'maintenance' || machine.status === 'offline') manual.push(`设备约束：${machine.name} 当前不可用`);
    if (task.kind === 'inspect' && machine.kind !== 'reach-stacker') manual.push('设备约束：查验作业需要正面吊或专用设备');
  }
  task.equipmentId = equipmentId;
  task.blockingReasons = manual;
  if (manual.length) nextStatus = 'blocked';
  else if (equipmentId) nextStatus = 'assigned';
  else if (task.status !== 'queued') nextStatus = 'queued';
  task.status = nextStatus;
  bumpGraph('TASK_REASSIGN', actor, id, `${equipmentId ?? '取消设备指派'}；${reason}`);
  return taskGraphSnapshot();
}
export function taskDetail(id: string) {
  const graph = taskGraphSnapshot();
  const item = graph.queue.find(task => task.id === id);
  if (!item) return undefined;
  const incoming = graph.relations.filter(relation => relation.toTaskId === id);
  const outgoing = graph.relations.filter(relation => relation.fromTaskId === id);
  const mergeRecord = graph.mergeRecords.find(record => record.survivorTaskId === id || record.mergedTaskIds.includes(id));
  return { task: item, incomingRelations: incoming, outgoingRelations: outgoing, mergeRecord, executable: graph.executableSet.includes(id), readyToDispatch: graph.readyToDispatch.includes(id), graphVersion: graph.version, calculation: { executableSet: graph.executableSet, explanation: item.explanation, duplicateGroup: graph.duplicateGroups.find(group => group.taskIds.includes(id)), nearDuplicateGuards: graph.nearDuplicateGuards.filter(guard => guard.taskIds.includes(id)), cycleGroups: graph.cycleGroups.filter(group => group.includes(id)) }, recentGraphAudit: graph.audit.slice(0, 8) };
}


export type ContainerInput = Omit<Container, 'lastEvent' | 'appointmentId'> & { appointmentId?: string };
export type AppointmentInput = Pick<GateAppointment, 'containerId' | 'truckNo' | 'driver' | 'type' | 'windowStart' | 'windowEnd' | 'lane'>;
export type TaskInput = Pick<YardTask, 'kind' | 'containerId' | 'from' | 'to' | 'priority' | 'scheduledAt' | 'estimatedMinutes'> & { equipmentId?: string; sourceLabel?: string };

function recordAudit(action: string, entity: string, entityId: string, details: string) {
  auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action, entity, entityId, at: new Date().toISOString(), details });
}

export function createContainer(input: ContainerInput) {
  const id = input.id.trim().toUpperCase();
  if (!id) throw new Error('箱号不能为空');
  if (containers.some(item => item.id === id)) throw new Error(`箱号 ${id} 已存在`);
  if (!voyages.some(item => item.id === input.voyageId)) throw new Error('关联航次不存在');
  const blockId = parseSlot(input.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (input.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  if (input.reefer && blockId) {
    const block = blocks.find(item => item.id === blockId);
    if (block && block.reeferPlugs <= block.usedPlugs) throw new Error('当前区块没有可用冷藏插座');
  }
  const item: Container = { ...input, id, lastEvent: `人工建档 ${new Date().toLocaleString()}` };
  containers.unshift(item);
  recordAudit('CREATE', 'container', item.id, '新增集装箱台账记录');
  return item;
}

export function updateContainer(id: string, patch: Partial<Omit<Container, 'id' | 'lastEvent'>>) {
  const item = containers.find(container => container.id === id);
  if (!item) return undefined;
  if (patch.voyageId && !voyages.some(voyage => voyage.id === patch.voyageId)) throw new Error('关联航次不存在');
  if (patch.voyageId && patch.voyageId !== item.voyageId && tasks.some(task => task.containerId === id)) throw new Error('该箱已有作业任务或任务关系，不能直接改航次；请新建正确航次计划');
  const next = { ...item, ...patch };
  const blockId = parseSlot(next.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (next.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  Object.assign(item, patch, { lastEvent: `台账更新 ${new Date().toLocaleString()}` });
  recordAudit('UPDATE', 'container', id, '更新集装箱台账字段');
  return item;
}

export function deleteContainer(id: string) {
  const index = containers.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = containers.splice(index, 1);
  const removedAppointments = appointments.filter(appointment => appointment.containerId === id);
  for (const appointment of removedAppointments) appointments.splice(appointments.indexOf(appointment), 1);
  const removedTasks = tasks.filter(task => task.containerId === id);
  if (removedTasks.some(isStarted)) throw new Error('该箱存在已开始作业，不能删除箱务台账；请先完成或失败闭环');
  const removedTaskIds = new Set(removedTasks.map(task => task.id));
  const removedRelations = taskRelations.filter(relation => removedTaskIds.has(relation.fromTaskId) || removedTaskIds.has(relation.toTaskId));
  for (let i = taskRelations.length - 1; i >= 0; i -= 1) {
    if (removedTaskIds.has(taskRelations[i].fromTaskId) || removedTaskIds.has(taskRelations[i].toTaskId)) taskRelations.splice(i, 1);
  }
  for (const task of removedTasks) tasks.splice(tasks.indexOf(task), 1);
  if (removedTasks.length || removedRelations.length) bumpGraph('TASK_GRAPH_CASCADE_DELETE', '中控调度员', id, `删除箱务台账并清理 ${removedTasks.length} 个任务、${removedRelations.length} 条关系`);
  recordAudit('DELETE', 'container', id, `删除箱务记录，并级联清理 ${removedAppointments.length} 条预约、${removedTasks.length} 条未开始任务、${removedRelations.length} 条关系`);
  return item;
}

export function createGateAppointment(input: AppointmentInput) {
  const container = containers.find(item => item.id === input.containerId);
  if (!container) throw new Error('箱号不存在');
  if (input.type === 'pickup' && container.customs !== 'released') throw new Error('海关未放行，不能预约提箱');
  if (new Date(input.windowEnd) <= new Date(input.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false };
  appointments.unshift(item);
  container.appointmentId = item.id;
  recordAudit('CREATE', 'appointment', item.id, `为 ${item.containerId} 创建闸口预约`);
  return item;
}

export function editGateAppointment(id: string, patch: Partial<AppointmentInput & Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) {
  const item = appointments.find(appointment => appointment.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('箱号不存在');
  if (patch.windowStart && patch.windowEnd && new Date(patch.windowEnd) <= new Date(patch.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const previousContainer = containers.find(container => container.id === item.containerId);
  Object.assign(item, patch);
  const nextContainer = containers.find(container => container.id === item.containerId);
  if (previousContainer && previousContainer.id !== nextContainer?.id && previousContainer.appointmentId === id) previousContainer.appointmentId = undefined;
  if (nextContainer) nextContainer.appointmentId = id;
  if (item.status === 'checked-in' && nextContainer) nextContainer.status = 'at-gate';
  if (item.status === 'completed' && nextContainer) nextContainer.status = item.type === 'pickup' ? 'released' : 'in-yard';
  recordAudit('UPDATE', 'appointment', id, `更新预约状态/时隙：${JSON.stringify(patch)}`);
  return item;
}

export function deleteGateAppointment(id: string) {
  const index = appointments.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = appointments.splice(index, 1);
  const container = containers.find(entry => entry.id === item.containerId);
  if (container?.appointmentId === id) container.appointmentId = undefined;
  recordAudit('DELETE', 'appointment', id, `取消并删除 ${item.containerId} 的闸口预约`);
  return item;
}

export function createYardTask(input: TaskInput) {
  if (!containers.some(container => container.id === input.containerId)) throw new Error('关联箱号不存在');
  if (input.priority < 1 || input.priority > 100) throw new Error('优先级范围为 1–100');
  if (input.estimatedMinutes <= 0) throw new Error('预计作业时长必须大于 0');
  const equipmentReasons: string[] = [];
  if (input.equipmentId) {
    const machine = equipment.find(item => item.id === input.equipmentId);
    if (!machine) throw new Error('指派设备不存在');
    if (machine.status === 'maintenance' || machine.status === 'offline') equipmentReasons.push(`设备约束：${machine.name} 当前不可用`);
    if (input.kind === 'inspect' && machine.kind !== 'reach-stacker') equipmentReasons.push('设备约束：查验作业需要正面吊或专用设备');
  }
  const item: YardTask = {
    ...input,
    id: `TASK-${Date.now()}-${String(nextTaskSequence++).padStart(3, '0')}`,
    status: equipmentReasons.length ? 'blocked' : input.equipmentId ? 'assigned' : 'queued',
    blockingReasons: equipmentReasons,
    scheduledAt: input.scheduledAt,
    sources: [{ id: `SRC-${Date.now()}`, label: input.sourceLabel?.trim() || '人工新建计划', createdAt: new Date().toISOString() }],
    graphVersion: graphVersion
  };
  tasks.unshift(item);
  bumpGraph('TASK_CREATE', '中控调度员', item.id, `创建 ${input.kind} 任务，关联 ${input.containerId}；来源：${item.sources[0].label}`);
  return taskGraphSnapshot().queue.find(task => task.id === item.id) ?? item;
}

export function updateYardTask(id: string, patch: Partial<Omit<TaskInput, 'sourceLabel' | 'equipmentId'>>) {
  const item = tasks.find(task => task.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('关联箱号不存在');
  if ('status' in patch) throw new Error('任务状态必须通过开始、完成、失败或取消接口流转，不能直接改写');
  if ('equipmentId' in patch) throw new Error('设备指派必须通过 reassign 接口，以记录版本和审计');
  if (isStarted(item) && Object.keys(patch).length > 0) throw new Error('已开始任务不能编辑计划或撤销');
  if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 100)) throw new Error('优先级范围为 1–100');
  const next = { ...item, ...patch };
  const changesIdentity = (patch.containerId !== undefined && patch.containerId !== item.containerId);
  const linked = taskRelations.some(relation => relation.fromTaskId === id || relation.toTaskId === id) || taskMergeRecords.some(record => record.survivorTaskId === id || record.mergedTaskIds.includes(id));
  if (changesIdentity && linked) throw new Error('任务已存在依赖、替代或合并记录，不能修改箱号；请取消关系或新建正确任务');
  if (next.containerId && !containers.some(container => container.id === next.containerId)) throw new Error('关联箱号不存在');
  Object.assign(item, patch);
  recordAudit('UPDATE', 'yard-task', id, `更新场内作业任务：${JSON.stringify(patch)}`);
  return item;
}

export function deleteYardTask(id: string) {
  const index = tasks.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const item = tasks[index];
  if (isStarted(item)) throw new Error('任务已开始，不能撤销或硬删除；请登记失败并保留审计');
  const successorIds = predecessorSuccessors(id);
  for (let i = taskRelations.length - 1; i >= 0; i -= 1) {
    if (taskRelations[i].fromTaskId === id || taskRelations[i].toTaskId === id) taskRelations.splice(i, 1);
  }
  successorIds.forEach(successorId => {
    const successor = getTask(successorId);
    if (!successor) return;
    successor.blockingReasons = successor.blockingReasons.filter(reason => !reason.includes(`前置 ${id} 已取消`));
    if (successor.status === 'blocked' && !successor.blockingReasons.some(reason => !reason.startsWith('设备约束：'))) successor.status = successor.equipmentId ? 'assigned' : 'queued';
  });
  tasks.splice(index, 1);
  bumpGraph('TASK_DELETE', '中控调度员', id, `删除未开始任务 ${id}（${item.containerId}），并移除其活动关系`);
  return item;
}

