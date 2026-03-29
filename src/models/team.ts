import type { Team } from '../types';
import { tid } from './task';

export const mkTeam = (name: string): Team => ({
  id: tid(), name,
  projects: [],
  snapshots: [],
  taskOrder: {},
  createdAt: new Date().toISOString(),
});
