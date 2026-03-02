import { ShellScreenView } from './components/ShellScreenView';
import { useShellScreenController } from './hooks/useShellScreenController';

export function ShellScreen() {
  const controller = useShellScreenController();
  return <ShellScreenView controller={controller} />;
}
