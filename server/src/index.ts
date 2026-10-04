import express from 'express';
import { appointments, assignTask, blocks, containerDetail, containers, createContainer, createGateAppointment, createYardTask, dashboard, deleteContainer, deleteGateAppointment, deleteYardTask, editGateAppointment, equipment, gateConflicts, prioritizeTasks, registerTaskLifecycleHooks, updateContainer, updateYardTask, voyages, yardHeatmap } from './domain.js';
import { beforeTaskDelete, beforeTaskRebind, computeSnapshot, declareRelation, listAudit, mergeTasks, PlannerConflict, reassignTask, revokeRelation, taskDetailView, transitionTask, unmergeTasks } from './planner.js';

registerTaskLifecycleHooks({ beforeDelete: beforeTaskDelete, beforeRebind: beforeTaskRebind });

const app = express(); app.use(express.json());
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/voyages', (_req, res) => res.json(voyages));
app.get('/api/containers', (req, res) => res.json(req.query.status ? containers.filter(c => c.status === req.query.status) : containers));
app.post('/api/containers', (req, res) => { try { res.status(201).json(createContainer(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建箱务记录失败' }); } });
app.patch('/api/containers/:id', (req, res) => { try { const result = updateContainer(req.params.id, req.body); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新箱务记录失败' }); } });
app.delete('/api/containers/:id', (req, res) => { const result = deleteContainer(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/containers/:id', (req, res) => { const result = containerDetail(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); });
app.get('/api/yard/heatmap', (_req, res) => res.json(yardHeatmap()));
app.get('/api/yard/blocks', (_req, res) => res.json(blocks));
app.get('/api/gate/appointments', (_req, res) => res.json(appointments));
app.get('/api/gate/conflicts', (_req, res) => res.json(gateConflicts()));
app.post('/api/gate/appointments', (req, res) => { try { res.status(201).json(createGateAppointment(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '预约失败' }); } });
app.patch('/api/gate/appointments/:id', (req, res) => { try { const result = editGateAppointment(req.params.id, req.body); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新预约失败' }); } });
app.delete('/api/gate/appointments/:id', (req, res) => { const result = deleteGateAppointment(req.params.id); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/equipment', (_req, res) => res.json(equipment));
app.get('/api/tasks', (_req, res) => res.json(prioritizeTasks()));
app.post('/api/tasks', (req, res) => { try { res.status(201).json(createYardTask(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建作业任务失败' }); } });
app.patch('/api/tasks/:id', (req, res) => { try { const result = updateYardTask(req.params.id, req.body); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新作业任务失败' }); } });
app.delete('/api/tasks/:id', (req, res) => { try { const result = deleteYardTask(req.params.id); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json({ deleted: true, id: result.id }); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '删除作业任务失败' }); } });
app.patch('/api/tasks/:id/assign', (req, res) => { const result = assignTask(req.params.id, req.body.equipmentId); if (!result) return res.status(404).json({ message: '任务或设备不存在' }); res.json(result); });

// —— 作业任务依赖与去重管理 ——
function handlePlannerError(error: unknown, res: express.Response) {
  if (error instanceof PlannerConflict) return res.status(409).json({ message: error.message, code: error.code, currentVersion: error.currentVersion });
  return res.status(409).json({ message: error instanceof Error ? error.message : '计划操作失败' });
}
app.get('/api/planner/snapshot', (_req, res) => res.json(computeSnapshot()));
app.get('/api/planner/tasks/:id', (req, res) => { const result = taskDetailView(req.params.id); if (!result) return res.status(404).json({ message: '任务不存在' }); res.json(result); });
app.post('/api/planner/relations', (req, res) => { try { res.status(201).json(declareRelation({ ...req.body, actor: req.body.actor ?? '中控调度员' })); } catch (error) { handlePlannerError(error, res); } });
app.delete('/api/planner/relations/:id', (req, res) => { try { res.json(revokeRelation(req.params.id, req.body?.actor, req.body?.expectedVersion)); } catch (error) { handlePlannerError(error, res); } });
app.post('/api/planner/merge', (req, res) => { try { res.status(201).json(mergeTasks({ ...req.body, actor: req.body.actor ?? '中控调度员' })); } catch (error) { handlePlannerError(error, res); } });
app.post('/api/planner/merge/:groupId/unmerge', (req, res) => { try { res.json(unmergeTasks(req.params.groupId, req.body?.actor ?? '中控调度员', req.body?.expectedVersion)); } catch (error) { handlePlannerError(error, res); } });
app.post('/api/planner/tasks/:id/transition', (req, res) => { try { res.json(transitionTask(req.params.id, req.body.status, req.body.actor ?? '中控调度员', req.body.expectedVersion)); } catch (error) { handlePlannerError(error, res); } });
app.post('/api/planner/tasks/:id/reassign', (req, res) => { try { res.json(reassignTask(req.params.id, req.body.equipmentId, req.body.actor ?? '中控调度员', req.body.expectedVersion)); } catch (error) { handlePlannerError(error, res); } });
app.get('/api/planner/audit', (req, res) => res.json(listAudit(Number(req.query.limit ?? 80))));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'port-yard-operations' }));
const port = Number(process.env.PORT || 4107); app.listen(port, () => console.log(`port yard API listening on ${port}`));
