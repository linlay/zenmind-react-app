import { ReactNode } from 'react';

export type ShellHeaderSideMode = 'normal' | 'wide';

export interface ShellHeaderDescriptor {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  sideMode?: ShellHeaderSideMode;
}
