import { ChatHomeScreen } from '../../features/chatPersistence/ChatHomeScreen';
import { AgentTaskBoardScreen } from '../../features/agentTaskBoard/AgentTaskBoardScreen';
import { MeScreen as MeAccountScreen } from './MeScreen';

export function ChatScreen() {
  return <ChatHomeScreen />;
}

export function TerminalScreen() {
  return <AgentTaskBoardScreen />;
}

export function MeScreen() {
  return <MeAccountScreen />;
}
