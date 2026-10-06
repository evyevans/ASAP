import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with conflict resolution (clone of Remi's cn helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
