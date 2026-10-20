
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workflow } from '@eimax/workflow-schema';
import { api, ApiError, type WorkflowRecord, type VersionInfo } from '@/lib/api';
export function useEditorState(id: string) {
  const [flow, setFlow] = useState<Workflow>();
  const flowRef = useRef<Workflow | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [role, setRole] = useState('viewer');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const revision = useRef(1);
  const saved = useRef('');
  const saving = useRef<Promise<number> | undefined>(undefined);
  const blocked = useRef(false);
  const past = useRef<Workflow[]>([]);
  const future = useRef<Workflow[]>([]);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const updateHistory = () => setHistory({ undo: past.current.length > 0, redo: future.current.length > 0 });
  const acceptFlow = (next: Workflow) => {
    flowRef.current = next;
    setFlow(next);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api<WorkflowRecord>(`/workflows/${id}`), api<{ role: string }>('/me')])
      .then(([record, me]) => {
        if (!active) return;
        flowRef.current = record.draft;
        setFlow(record.draft);
        revision.current = record.revision;
        saved.current = JSON.stringify(record.draft);
        setVersions(record.versions);
        setRole(me.role);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);
  const checkpoint = useCallback(() => {
    if (flowRef.current) {
      past.current.push(structuredClone(flowRef.current));
      past.current = past.current.slice(-60);
      future.current = [];
      updateHistory();
    }
  }, []);
  const change = useCallback(
    (fn: (flow: Workflow) => Workflow, record = true) => {
      if (!flowRef.current || role === 'viewer') return;
      const next = fn(flowRef.current);
      if (JSON.stringify(next) === JSON.stringify(flowRef.current)) return;
      if (record) checkpoint();
      acceptFlow(next);
      setSaveStatus(blocked.current ? 'conflict' : 'dirty');
    },
    [checkpoint, role],
  );
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous || !flowRef.current) return;
    future.current.push(flowRef.current);
    acceptFlow(previous);
    updateHistory();
    setSaveStatus('dirty');
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !flowRef.current) return;
    past.current.push(flowRef.current);
    acceptFlow(next);
    updateHistory();
    setSaveStatus('dirty');
  }, []);
  const save = useCallback(
    async function flush(): Promise<number> {
      if (blocked.current)
        throw new Error('Conflito com outra aba. Exporte seu rascunho antes de recarregar.');
      if (saving.current) {
        await saving.current;
        return flush();
      }
      if (!flowRef.current || JSON.stringify(flowRef.current) === saved.current) {
        setSaveStatus('saved');
        return revision.current;
      }
      const draft = structuredClone(flowRef.current);
      const serialized = JSON.stringify(draft);
      setSaveStatus('saving');
      const pending = api<WorkflowRecord>(`/workflows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: revision.current, draft }),
      })
        .then((row) => {
          revision.current = row.revision;
          saved.current = serialized;
          setSaveStatus(JSON.stringify(flowRef.current) === serialized ? 'saved' : 'dirty');
          return row.revision;
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 409) {
            blocked.current = true;
            setSaveStatus('conflict');
          } else setSaveStatus('error');
          setError(e.message);
          throw e;
        })
        .finally(() => {
          saving.current = undefined;
        });
      saving.current = pending;
      await pending;
      return JSON.stringify(flowRef.current) !== saved.current ? flush() : revision.current;
    },
    [id],
  );
  useEffect(() => {
    if (!flow || role === 'viewer' || saveStatus !== 'dirty') return;
    const timer = setTimeout(() => {
      save().catch(() => {});
    }, 850);
    return () => clearTimeout(timer);
  }, [flow, role, saveStatus, save]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (flowRef.current && JSON.stringify(flowRef.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, []);
  return {
    flow,
    loading,
    error,
    setError,
    saveStatus,
    save,
    change,
    checkpoint,
    undo,
    redo,
    history,
    versions,
    setVersions,
    role,
  };
}
