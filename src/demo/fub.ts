import { demoStore } from './store';
import type { FubPerson, FubPersonDetail } from '../hooks/useFubPeople';

export async function callDemoFub<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  const people = (await demoStore.from('demo_people').select()).data as FubPerson[];
  if (path.startsWith('/')) {
    const id = Number(path.slice(1));
    const rows = (await demoStore.from('demo_person_details').select()).data as FubPersonDetail[];
    const detail = rows.find(row => row.person.id === id);
    return { data: (detail ?? null) as T | null, error: detail ? null : 'That sample contact was not found.' };
  }
  const params = new URLSearchParams(path);
  const query = (params.get('q') ?? '').toLowerCase();
  const stage = params.get('stage');
  const filtered = people.filter(person => person.name.toLowerCase().includes(query) && (!stage || person.stage === stage));
  return { data: { people: filtered, total: filtered.length, stages: [...new Set(people.map(p => p.stage).filter(Boolean))] } as T, error: null };
}
