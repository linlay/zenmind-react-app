import { useFocusEffect } from '@react-navigation/native';
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { useT } from '../../shared/i18n';
import { createBoardViewText } from './agentTaskBoardText';
import { useDesktopKanbanBoard, type DesktopKanbanBoardState } from './useDesktopKanbanBoard';

type AgentTaskBoardContextValue = {
  board: DesktopKanbanBoardState;
  retainActiveBoard: () => () => void;
};

const AgentTaskBoardContext = createContext<AgentTaskBoardContextValue | null>(null);
const retainInactiveBoard = () => () => undefined;

type AgentTaskBoardProviderProps = {
  children: ReactNode;
};

export function AgentTaskBoardProvider({ children }: AgentTaskBoardProviderProps) {
  const t = useT();
  const [activeRetainCount, setActiveRetainCount] = useState(0);
  const boardText = useMemo(() => createBoardViewText(t), [t]);
  const board = useDesktopKanbanBoard({
    enabled: activeRetainCount > 0,
    projectId: 'default',
    text: boardText,
    errorFallback: t('tasks.error.generic'),
    missingTaskFallback: t('tasks.emptyHint'),
    runStartedSyncPendingFallback: t('tasks.error.runStartedSyncPending')
  });
  const retainActiveBoard = useCallback(() => {
    let released = false;
    setActiveRetainCount((current) => current + 1);
    return () => {
      if (released) {
        return;
      }
      released = true;
      setActiveRetainCount((current) => Math.max(0, current - 1));
    };
  }, []);
  const value = useMemo<AgentTaskBoardContextValue>(
    () => ({ board, retainActiveBoard }),
    [board, retainActiveBoard]
  );

  return <AgentTaskBoardContext.Provider value={value}>{children}</AgentTaskBoardContext.Provider>;
}

export function useAgentTaskBoard(): DesktopKanbanBoardState {
  const context = useContext(AgentTaskBoardContext);
  const retainActiveBoard = context?.retainActiveBoard ?? retainInactiveBoard;
  useFocusEffect(useCallback(() => retainActiveBoard(), [retainActiveBoard]));

  if (!context) {
    throw new Error('useAgentTaskBoard must be used within AgentTaskBoardProvider');
  }

  return context.board;
}
