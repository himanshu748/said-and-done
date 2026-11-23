import { invoke as bridgeInvoke, router, view } from '@forge/bridge';
import type { FollowUp, Stats, Status } from '@core/ledger';

function invoke<T>(name: string, payload?: Record<string, unknown>): Promise<T> {
  return bridgeInvoke(name, payload) as Promise<T>;
}

export interface Ledger {
  product: 'jira' | 'confluence';
  now: number;
  viewer: string | null;
  scoped: boolean;
  items: FollowUp[];
  stats: Stats;
}

export interface Context {
  moduleKey: string;
}

export const getContext = async (): Promise<Context> => {
  void view.theme?.enable?.().catch(() => undefined);
  const c = (await view.getContext()) as { moduleKey?: string };
  return { moduleKey: c.moduleKey ?? 'jira-ledger' };
};

export const loadLedger = (): Promise<Ledger> => invoke<Ledger>('list');
export const setStatus = (id: string, status: Status): Promise<FollowUp> => invoke<FollowUp>('setStatus', { id, status });
export const setDue = (id: string, day: string | null): Promise<FollowUp> => invoke<FollowUp>('setDue', { id, day });
export const scan = (): Promise<{ scanned: number; found: number }> => invoke('scan');
export const open = (url: string): void => {
  void router.navigate(url);
};
