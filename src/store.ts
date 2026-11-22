import { kvs, WhereConditions } from '@forge/kvs';
import type { FollowUp } from './core/ledger';

const PREFIX = 'fu:';

export const getFollowUp = (id: string): Promise<FollowUp | undefined> => kvs.get<FollowUp>(PREFIX + id);

export async function saveFollowUp(f: FollowUp): Promise<void> {
  await kvs.set(PREFIX + f.id, f);
}

export async function listFollowUps(): Promise<FollowUp[]> {
  const out: FollowUp[] = [];
  let cursor: string | undefined;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(PREFIX)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany<FollowUp>();
    for (const r of page.results) out.push(r.value);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function listForContainer(containerId: string): Promise<FollowUp[]> {
  return (await listFollowUps()).filter((f) => f.source.containerId === containerId);
}
