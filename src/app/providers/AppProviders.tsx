import { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { store } from '../store/store';

export function AppProviders({ children }: PropsWithChildren) {
  return <Provider store={store}>{children}</Provider>;
}
