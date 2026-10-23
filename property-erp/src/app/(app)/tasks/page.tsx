import { redirect } from "next/navigation";
import { createTaskAction, setTaskStatusAction } from "@/app/actions/ops";
import { ActionButton, ActionForm, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, FilterBar, FilterSelect, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { listProperties } from "@/server/services/properties";
import { listTasks } from "@/server/services/tasks";
import { load, sp, type SP } from "../_lib/guard";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("task.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  const [rows, users, props] = await Promise.all([
    load(listTasks(ctx, { mine: q.mine === "1", status: q.status })),
    prisma.user.findMany({ where: { organizationId: ctx.orgId, isActive: true, role: { key: { not: "TENANT" } } }, select: { id: true, name: true } }),
    listProperties(ctx),
  ]);
  const uname = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={t.nav.tasks} />
      <Card bodyClassName="p-0">
        <FilterBar resetHref="/tasks" submitLabel={t.common.apply} resetLabel={t.common.reset}>
          <FilterSelect name="mine" label={L("المسند", "Assigned")} value={q.mine} options={[{ value: "1", label: L("مهامي", "My tasks") }]} allLabel={t.common.all} />
          <FilterSelect name="status" label={t.common.status} value={q.status} options={enumOptions(t, "TaskStatus")} allLabel={L("المفتوحة", "Open")} />
        </FilterBar>
        <DataTable rows={rows} rowKey={(r) => r.id} empty={<Empty title={t.common.empty} />} cols={[
          { key: "t", label: L("المهمة", "Task"), primary: true, render: (r) => <><span className="font-semibold">{r.title}</span>{r.description && <p className="text-xs text-muted">{r.description}</p>}</> },
          { key: "a", label: L("المسند إليه", "Assignee"), render: (r) => (r.assignedToId ? uname.get(r.assignedToId) : "—") },
          { key: "d", label: L("الموعد", "Due"), render: (r) => <span className="num">{fmtDate(r.dueDate)}</span> },
          { key: "p", label: L("الأولوية", "Priority"), render: (r) => <Badge status={r.priority}>{label(t, "Priority", r.priority)}</Badge> },
          { key: "s", label: t.common.status, render: (r) => <Badge status={r.status}>{label(t, "TaskStatus", r.status)}</Badge> },
          { key: "x", label: "", render: (r) => r.status !== "DONE" && <span className="flex gap-1">{r.status === "OPEN" && <ActionButton action={setTaskStatusAction} fields={{ id: r.id, status: "IN_PROGRESS" }} label={L("بدء", "Start")} className="btn-ghost btn-sm" />}<ActionButton action={setTaskStatusAction} fields={{ id: r.id, status: "DONE" }} label={L("إنجاز", "Done")} /></span> },
        ]} />
      </Card>
      <Card title={L("مهمة جديدة", "New task")} className="mt-4">
        <ActionForm action={createTaskAction} submitLabel={t.common.add} resetOnSuccess>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input name="title" label={L("العنوان", "Title")} required />
            <Select name="assignedToId" label={L("المسند إليه", "Assignee")} options={users.map((u) => ({ value: u.id, label: u.name }))} placeholder={t.common.none} />
            <Select name="propertyId" label={t.common.property} options={props.map((p) => ({ value: p.id, label: p.name }))} placeholder={t.common.none} />
            <Input name="dueDate" type="date" label={L("الموعد", "Due")} />
            <Select name="priority" label={L("الأولوية", "Priority")} options={enumOptions(t, "Priority")} defaultValue="MEDIUM" />
            <Textarea name="description" label={t.common.description} />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
