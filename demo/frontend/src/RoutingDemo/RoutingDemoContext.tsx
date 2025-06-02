import { createContext, useContext } from 'react';

type RoutingDemoNavigationType = 'declarativeV4V5' | 'declarativeV6+' | 'data';
type RoutingDemoContext = {
  navigationType: RoutingDemoNavigationType | null;
  setNavigationType: (type: RoutingDemoNavigationType | null) => void;
};

const RoutingDemoContext = createContext<RoutingDemoContext>({
  navigationType: null,
  setNavigationType: () => {},
});

const RoutingDemoContextProvider = RoutingDemoContext.Provider;

const useRoutingDemoContext = () => {
  const context = useContext(RoutingDemoContext);

  if (!context) {
    throw new Error(
      'useRoutingDemoContext must be used within a RoutingDemoContextProvider'
    );
  }

  return context;
};

export {
  RoutingDemoContextProvider,
  useRoutingDemoContext,
  type RoutingDemoNavigationType,
};
