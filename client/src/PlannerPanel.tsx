import { useEffect, useMemo, useState } from 'react';

export type PlanSnapshot = {
  version: number;
  computedAt: string;
  executable: TaskView[];
  suppressed: TaskView[];
  waiting: TaskView[];
  cycles: { taskIds: string[]; message: string }[];
  relations: Relation[];
  mergeGroups: { groupId: string; survivorId: string; mergedTaskIds: string[]; mergedAt: string }[];
  stats: { total: number; executable: number; suppressed: number; waiting: number; blocked: number; merged: number };
  derivation: string[];
};
export type TaskView = {
  task: YardTask;
  containerVoyageId?: string;
  effectiveStatus: string;
  executable: boolean;
  reasons: string[];
  prerequisites: { id: string; status: string; satisfied: boolean }[];
  replacements: { replacementId: string; status: string; effective: boolean }[];
  mutexes: { otherId: string; otherStatus: string; winnerId?: string }[];
  mergedOrigins: { source: string; reference?: string; createdAt: string; note?: string }[];
  mergedAwayTasks: string[];
  warnings: string[];
};
type YardTask = { id: string; kind: string; containerId: string; from: string; to: string; equipmentId?: string; priority: number; status: string; scheduledAt: string; blockingReasons: string[]; estimatedMinutes: number; origins?: { source: string; reference?: string; createdAt: string; note?: string }[]; mergeGroupId?: string; mergedIntoId?: string; revision?: number };
type Relation = { id: string; kind: 'prerequisite' | 'mutex' | 'replacement'; upTaskId: string; downTaskId: string; declaredBy: string; declaredAt: string; active: boolean; note?: string };
type Equipment = { id: string; name: string; kind: string; status: string };
type AuditEvent = { id: string; actor: string; action: string; entityId: string; at: string; details: string };
type Detail = { view: TaskView; relations: Relation[]; mergeRecord?: { id: string; groupId: string; mergedBy: string; mergedAt: string; mergedTaskIds: string[]; undone: boolean }; lineage: string[]; planVersion: number };

type PlannerApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

const kindLabel: Record<string, string> = { prerequisite: '前置', mutex: '互斥', replacement: '替代' };
const effectiveLabel: Record<string, string> = {
  ready: '可执行', waiting: '等待前置', blocked: '阻塞', suppressed: '被压下',
  executing: '执行中', done: '完成', failed: '失败', cancelled: '已取消', merged: '已合并', cycle: '依赖环',
};
const statusOptions: Record<string, { label: string; next: string }[]> = {
  queued: [{ label: '指派/接单', next: 'assigned' }, { label: '开始执行', next: 'executing' }, { label: '取消', next: 'cancelled' }],
  assigned: [{ label: '开始执行', next: 'executing' }, { label: '退回队列', next: 'queued' }],
  executing: [{ label: '完成', next: 'done' }, { label: '报失败', next: 'failed' }],
  failed: [{ label: '重新排队', next: 'queued' }],
  cancelled: [{ label: '重新排队', next: 'queued' }],
  blocked: [{ label: '退回队列', next: 'queued' }, { label: '取消', next: 'cancelled' }],
};
const time = (value: string) => new Date(value).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function PlannerPanel({ snapshot, equipment, api, reload, onError, onMessage }: {
  snapshot: PlanSnapshot;
  equipment: Equipment[];
  api: PlannerApi;
  reload: () => Promise<void>;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
}) {
  const allViews = useMemo(
    () => [...snapshot.executable, ...snapshot.waiting, ...snapshot.suppressed],
    [snapshot],
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [survivorId, setSurvivorId] = useState('');
  const [relationKind, setRelationKind] = useState<'prerequisite' | 'mutex' | 'replacement'>('prerequisite');
  const [relationUp, setRelationUp] = useState('');
  const [relationDown, setRelationDown] = useState('');
  const [relationNote, setRelationNote] = useState('');
  const [detailId, setDetailId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [showDerivation, setShowDerivation] = useState(true);

  const loadAudit = () => api<{ id: string; actor: string; action: string; entityId: string; at: string; details: string }[]>('/planner/audit?limit=40').then(events => setAudit(events)).catch(() => undefined);
  useEffect(() => { void loadAudit(); }, [snapshot.version]);
  useEffect(() => {
    if (!detailId) { setDetail(undefined); return; }
    api<Detail>(`/planner/tasks/${detailId}`).then(setDetail).catch(() => setDetail(undefined));
  }, [detailId, snapshot.version]);

  const act = async (path: string, body?: unknown, method = 'POST') => {
    try {
      await api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify({ ...(body as object), expectedVersion: snapshot.version }) }) });
      await reload();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '操作失败');
    }
  };

  const pickedViews = allViews.filter(view => picked.has(view.task.id));
  const identityGroups = new Map(pickedViews.map(view => [`${view.task.containerId}|${view.containerVoyageId}`, true]));
  const identityConsistent = identityGroups.size <= 1;
  const lockablePicked = pickedViews.filter(view => ['assigned', 'executing', 'done'].includes(view.task.status));
  const mergeable = picked.size >= 2 && identityConsistent && lockablePicked.length === 0
    && !pickedViews.some(view => view.task.status === 'merged');

  const togglePick = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submitRelation = async () => {
    if (!relationUp || !relationDown) { onError('请选择关系两端的任务'); return; }
    setRelationNote('');
    await act('/planner/relations', { kind: relationKind, upTaskId: relationUp, downTaskId: relationDown, note: relationNote || undefined });
    setRelationUp(''); setRelationDown('');
  };

  const submitMerge = async () => {
    const target = survivorId || pickedViews[0]?.task.id;
    if (!target) return;
    onMessage(`正在合并：存活任务 ${target}`);
    await act('/planner/merge', { survivorId: target, taskIds: pickedViews.map(v => v.task.id).filter(id => id !== target) });
    setPicked(new Set()); setSurvivorId('');
  };

  return <div className="planner-wrap">
    <section className="panel wide">
      <div className="panel-head">
        <div>
          <div className="eyebrow">PLAN GRAPH / 可执行集合推导</div>
          <h2>任务依赖与去重 · 当前可执行集合</h2>
        </div>
        <span className="muted">计划版本 v{snapshot.version} · {time(snapshot.computedAt)} 计算 · 所有写操作基于该版本做乐观并发控制</span>
      </div>
      <div className="plan-stats">
        <div><strong className="ok">{snapshot.stats.executable}</strong><span>可执行</span></div>
        <div><strong className="warning">{snapshot.stats.waiting}</strong><span>等待前置</span></div>
        <div><strong className="critical">{snapshot.stats.blocked}</strong><span>阻塞/断链</span></div>
        <div><strong>{snapshot.stats.suppressed}</strong><span>互斥/替代压下</span></div>
        <div><strong>{snapshot.stats.merged}</strong><span>已合并去重</span></div>
        <div><strong>{snapshot.cycles.length}</strong><span>依赖环</span></div>
      </div>
      {snapshot.cycles.map(cycle => <div className="conflict" key={cycle.message}><strong>cycle</strong><b>{cycle.taskIds.join(' → ')}</b><span>{cycle.message}，环上任务全部不可执行，请撤销环上的一条前置/替代关系</span></div>)}
      <button className="link-button" onClick={() => setShowDerivation(value => !value)}>{showDerivation ? '收起' : '展开'}可执行集合推导明细（{snapshot.derivation.length} 条）</button>
      {showDerivation && <ol className="derivation-list">
        {snapshot.derivation.map((line, index) => <li key={index} className={line.startsWith('×') ? 'derived-out' : 'derived-in'}>{line}</li>)}
      </ol>}
    </section>

    <section className="panel wide">
      <div className="panel-head">
        <h3>任务队列（按可执行性分组）</h3>
        <span className="muted">勾选同箱同航次的重复任务可合并；跨箱号/跨航次会被拒绝</span>
      </div>
      <PlanGroup title="① 可执行 — 设备可以立即接单" views={snapshot.executable} equipment={equipment} picked={picked}
        togglePick={togglePick} onDetail={setDetailId} onTransition={(id, status) => void act(`/planner/tasks/${id}/transition`, { status })}
        onReassign={(id, equipmentId) => void act(`/planner/tasks/${id}/reassign`, { equipmentId })} />
      <PlanGroup title="② 暂不可执行 — 等待、阻塞、失败、依赖环" views={snapshot.waiting} equipment={equipment} picked={picked}
        togglePick={togglePick} onDetail={setDetailId} onTransition={(id, status) => void act(`/planner/tasks/${id}/transition`, { status })}
        onReassign={(id, equipmentId) => void act(`/planner/tasks/${id}/reassign`, { equipmentId })} />
      <PlanGroup title="③ 已压下 / 终态 — 互斥胜出、替代生效、已合并或已完成" views={snapshot.suppressed} equipment={equipment} picked={picked}
        togglePick={togglePick} onDetail={setDetailId} onTransition={(id, status) => void act(`/planner/tasks/${id}/transition`, { status })}
        onReassign={(id, equipmentId) => void act(`/planner/tasks/${id}/reassign`, { equipmentId })} />
    </section>

    <div className="layout">
      <section className="panel">
        <div className="panel-head"><h3>合并去重</h3><span className="muted">{picked.size} 个任务待处理</span></div>
        {picked.size === 0 && <p className="hint">在上方任务前打勾，选择 2 个及以上任务。系统只允许「同箱号 + 同航次」的计划合并。</p>}
        {picked.size > 0 && <div className="merge-box">
          {pickedViews.map(view => <label key={view.task.id} className="merge-row">
            <input type="radio" name="survivor" checked={(survivorId || pickedViews[0].task.id) === view.task.id} onChange={() => setSurvivorId(view.task.id)} />
            <b>{view.task.id}</b><span>{view.task.containerId} · {view.containerVoyageId}</span><small>{view.task.kind} · {view.task.from} → {view.task.to}</small>
          </label>)}
          {!identityConsistent && <div className="form-error">箱号或航次不一致（{[...identityGroups.keys()].join('；')}），这些相似任务禁止合并</div>}
          {lockablePicked.length > 0 && <div className="form-error">{lockablePicked.map(v => v.task.id).join('、')} 已开始执行，不可撤销或合并</div>}
          <button className="primary-action" disabled={!mergeable} onClick={() => void submitMerge()}>合并为一个执行计划并保留全部来源</button>
          <button className="ghost-action" onClick={() => { setPicked(new Set()); setSurvivorId(''); }}>清空选择</button>
        </div>}
        {snapshot.mergeGroups.length > 0 && <div className="merge-groups">
          <div className="eyebrow">合并组（来源已并入存活任务）</div>
          {snapshot.mergeGroups.map(group => <div key={group.groupId} className="merge-group">
            <b>{group.groupId}</b><span>存活 {group.survivorId} 吸收 {group.mergedTaskIds.join('、')}</span>
            <button onClick={() => void act(`/planner/merge/${group.groupId}/unmerge`)}>撤销合并</button>
          </div>)}
        </div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h3>声明前置 / 互斥 / 替代</h3></div>
        <div className="relation-form">
          <select value={relationKind} onChange={event => setRelationKind(event.target.value as typeof relationKind)}>
            <option value="prerequisite">前置（B 等 A 完成）</option>
            <option value="mutex">互斥（两者只能执行其一）</option>
            <option value="replacement">替代（A 取代 B，A 失败则 B 恢复）</option>
          </select>
          <select value={relationUp} onChange={event => setRelationUp(event.target.value)}>
            <option value="">A：{relationKind === 'replacement' ? '替代任务' : relationKind === 'mutex' ? '冲突任务一' : '前置任务'}</option>
            {allViews.filter(v => v.task.status !== 'merged').map(view => <option key={view.task.id} value={view.task.id}>{view.task.id} · {view.task.containerId} · {view.task.kind}</option>)}
          </select>
          <select value={relationDown} onChange={event => setRelationDown(event.target.value)}>
            <option value="">B：{relationKind === 'replacement' ? '被替代任务' : relationKind === 'mutex' ? '冲突任务二' : '后置任务'}</option>
            {allViews.filter(v => v.task.status !== 'merged').map(view => <option key={view.task.id} value={view.task.id}>{view.task.id} · {view.task.containerId} · {view.task.kind}</option>)}
          </select>
          <input placeholder="备注（可选）" value={relationNote} onChange={event => setRelationNote(event.target.value)} />
          <button className="primary-action" onClick={() => void submitRelation()}>声明关系</button>
        </div>
        <div className="relation-list">
          {snapshot.relations.length === 0 && <p className="hint">暂无关系声明。</p>}
          {snapshot.relations.map(rel => <div key={rel.id} className={`relation-item ${rel.kind}`}>
            <b>{kindLabel[rel.kind]}</b><span>{rel.upTaskId} → {rel.downTaskId}</span>
            {rel.note && <small>{rel.note}</small>}
            <button onClick={() => void act(`/planner/relations/${rel.id}`, undefined, 'DELETE')}>撤销</button>
          </div>)}
        </div>
      </section>
    </div>

    <section className="panel wide">
      <div className="panel-head"><h3>计划审计</h3><span className="muted">关系声明、合并去重、替代恢复、状态流转与设备改派全部留痕</span></div>
      <div className="audit-list">
        {audit.map(event => <div key={event.id} className="audit-row">
          <b>{event.action}</b><span>{event.entityId}</span><small>{event.details}</small><em>{event.actor} · {time(event.at)}</em>
        </div>)}
      </div>
    </section>

    {detailId && detail && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDetailId(undefined); }}>
      <div className="editor-modal detail-modal">
        <div className="modal-head">
          <div><div className="eyebrow">TASK DETAIL / 推导解释</div><h2>{detail.view.task.id} · {detail.view.task.kind}</h2></div>
          <button type="button" className="icon-button" onClick={() => setDetailId(undefined)}>×</button>
        </div>
        <div className="detail-grid">
          <div><small>箱号 / 航次</small><b>{detail.view.task.containerId} / {detail.view.containerVoyageId}</b></div>
          <div><small>路径</small><b>{detail.view.task.from} → {detail.view.task.to}</b></div>
          <div><small>原始状态 → 推导状态</small><b>{detail.view.task.status} → {effectiveLabel[detail.view.effectiveStatus] ?? detail.view.effectiveStatus}</b></div>
          <div><small>当前设备</small><b>{detail.view.task.equipmentId ?? '未指派'}</b></div>
        </div>
        <h4>为什么是这个结论</h4>
        <ul className="reason-list">{detail.view.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
        {detail.view.warnings.length > 0 && <><h4>调度告警</h4><ul className="reason-list warning-list">{detail.view.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></>}
        <h4>依赖关系</h4>
        <div className="relation-list">
          {detail.relations.length === 0 && <p className="hint">无</p>}
          {detail.relations.map(rel => <div key={rel.id} className={`relation-item ${rel.kind}`}><b>{kindLabel[rel.kind]}</b><span>{rel.upTaskId} → {rel.downTaskId}</span>{rel.note && <small>{rel.note}</small>}</div>)}
        </div>
        <h4>来源血缘（{detail.lineage.length}）</h4>
        <ul className="reason-list">{detail.lineage.map((line, i) => <li key={i}>{line}</li>)}</ul>
      </div>
    </div>}
  </div>;
}

function PlanGroup({ title, views, equipment, picked, togglePick, onDetail, onTransition, onReassign }: {
  title: string;
  views: TaskView[];
  equipment: Equipment[];
  picked: Set<string>;
  togglePick: (id: string) => void;
  onDetail: (id: string) => void;
  onTransition: (id: string, next: string) => void;
  onReassign: (id: string, equipmentId: string) => void;
}) {
  if (!views.length) return null;
  return <div className="plan-group">
    <div className="plan-group-title">{title}（{views.length}）</div>
    <div className="table planner-table"><div className="tr th"><span>选择</span><span>任务 / 来源</span><span>箱号 / 航次</span><span>路径</span><span>推导结论</span><span>设备 / 流转</span></div>
      {views.map(view => {
        const task = view.task;
        const locked = ['executing', 'done'].includes(task.status);
        return <div className="tr" key={task.id}>
          <span><input type="checkbox" checked={picked.has(task.id)} disabled={task.status === 'merged' || locked} onChange={() => togglePick(task.id)} /></span>
          <span><b>{task.id}</b><small>{task.kind} · P{task.priority} · {task.estimatedMinutes}min
            {view.mergedOrigins.length > 0 && <em className="origin-chip">{view.mergedOrigins.length} 条来源</em>}
            {view.mergedAwayTasks.length > 0 && <em className="merged-chip">已去重 {view.mergedAwayTasks.join('、')}</em>}
          </small></span>
          <span><b>{task.containerId}</b><small>{view.containerVoyageId}</small></span>
          <span>{task.from} → {task.to}</span>
          <span><span className={`effective effective-${view.effectiveStatus}`}>{effectiveLabel[view.effectiveStatus] ?? view.effectiveStatus}</span>
            {view.reasons.map((reason, i) => <small key={i} className={view.executable ? 'reason-ok' : 'blocked-text'}>{reason}</small>)}
            {view.warnings.map((warning, i) => <small key={`w${i}`} className="warning-text">⚠ {warning}</small>)}
          </span>
          <span className="task-actions">
            <select value={task.equipmentId ?? ''} disabled={task.status === 'merged' || task.status === 'done' || task.status === 'cancelled'}
              onChange={event => onReassign(task.id, event.target.value)}>
              <option value="">未指派</option>
              {equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {(statusOptions[task.status] ?? []).map(option => <button key={option.next} className={option.next === 'cancelled' || option.next === 'failed' ? 'danger-action' : ''}
              onClick={() => onTransition(task.id, option.next)}>{option.label}</button>)}
            <button onClick={() => onDetail(task.id)}>详情</button>
          </span>
        </div>;
      })}
    </div>
  </div>;
}
