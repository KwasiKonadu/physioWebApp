"use client";
// Diagnosis detail dialog with revision history.

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { labelize } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import * as API from "./assessments-api";
import { severityBadge, DRow } from "./DiagnosisShared";

// ===================== detail dialog + change history =====================
export function DiagnosisDetailDialog({ item, onClose, onRevise, canManage }: {
  item: API.DiagnosisListItem | null; onClose: () => void; onRevise: () => void; canManage: boolean;
}) {
  const history = API.parseHistory(item?.changeHistory);
  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                <span>{item.title}</span>
                <StatusBadge status={item.status} />
              </DialogTitle>
              <DialogDescription>
                {fullName(item.episode?.patient || {}) || "—"} · {item.episode?.title || "—"} · {formatDate(item.diagnosisDate)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{labelize(item.category)}</Badge>
                {item.severity ? severityBadge(item.severity) : null}
                {item.provisional ? (
                  <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Provisional</Badge>
                ) : null}
              </div>
              <dl className="rounded-lg border bg-muted/10 px-3 py-2">
                <DRow label="Body part" value={item.bodyPart} />
                <DRow label="Affected side" value={item.affectedSide ? labelize(item.affectedSide) : ""} />
                <DRow label="Diagnosed by" value={item.therapistName} />
                <DRow label="Date" value={formatDate(item.diagnosisDate)} />
              </dl>
              {item.explanation ? (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Clinical explanation</h4>
                  <p className="whitespace-pre-wrap rounded-lg border bg-muted/10 p-3 text-sm text-muted-foreground">{item.explanation}</p>
                </div>
              ) : null}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Change history</h4>
                {history.length === 0 ? (
                  <EmptyStateCompact message="No revisions recorded for this diagnosis." />
                ) : (
                  <ol className="space-y-2 border-l-2 border-teal-200 pl-4">
                    {history.map((h, i) => (
                      <li key={i} className="relative">
                        <span className="absolute left-[-21.5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-teal-500 bg-white" />
                        <p className="text-xs text-muted-foreground">{formatDate(h.date)} · by {h.by}</p>
                        <p className="text-sm font-medium">{h.from} → superseded</p>
                        <p className="text-xs text-muted-foreground">{h.justification}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              {canManage && item.status === "ACTIVE" ? (
                <Button onClick={onRevise}><AtomIcon name="FilePenLine" className="h-4 w-4" />Revise</Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
