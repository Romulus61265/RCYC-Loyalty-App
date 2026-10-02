import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Services } from './contracts';
import { createServices } from './registry';

const ServicesContext = createContext<Services | null>(null);

export function ServiceProvider({ children, services }: { children: ReactNode; services?: Services }) {
  const value = useMemo(() => services ?? createServices(), [services]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

/** Screens obtain services only through this hook — never by importing an implementation. */
export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServiceProvider>');
  return ctx;
}
