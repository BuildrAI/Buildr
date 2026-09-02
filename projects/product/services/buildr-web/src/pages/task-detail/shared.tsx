import type { ReactNode } from 'react';
import type {
  TaskDetailResponse,
  TaskRecord,
  TaskRelationSummary,
} from '../../api/generated/task-record-http-dto';

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function TechnicalDetails({ value }: { value: string }) {
  return (
    <details className="technical-details compact">
      <summary>技术信息</summary>
      <small className="review-result-path">{value}</small>
    </details>
  );
}

export function lines(values: string[], secondField?: never): string;
export function lines(values: Array<{ project: string; service: string }>, secondField: 'service'): string;
export function lines(values: Array<string | { project: string; service: string }>, secondField?: 'service'): string {
  return values.map((item) => (
    secondField && typeof item !== 'string' ? `${item.project}/${item[secondField]}` : String(item)
  )).join('\n');
}

export function parseLines(raw: string): string[] {
  return String(raw || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function qualified(value: string, secondField: 'service'): { project: string; service: string } | string {
  const [project, identity, ...rest] = value.split('/');
  return rest.length || !project || !identity ? value : { project, [secondField]: identity };
}

export function diff<T>(
  current: T[],
  next: T[],
  key: (item: T) => string = (item) => (typeof item === 'string' ? item : JSON.stringify(item)),
): { add: T[]; remove: T[] } {
  const currentKeys = new Set(current.map(key));
  const nextKeys = new Set(next.map(key));
  return {
    add: next.filter((item) => !currentKeys.has(key(item))),
    remove: current.filter((item) => !nextKeys.has(key(item))),
  };
}

export type { TaskRecord, TaskRelationSummary };
export type TaskDetailData = TaskDetailResponse;

export type TaskTab = 'overview' | 'prototype' | 'evidence';
